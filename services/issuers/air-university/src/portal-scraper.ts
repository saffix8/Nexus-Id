import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export interface AUStudentData {
  name: string;
  registration_number: string;
  program: string;
  department: string;
  batch: string;
  cgpa: number;
  enrollment_status: string;
  semester_count: number;
}

export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'LOGIN_FAILED'
      | 'OTP_REQUIRED'
      | 'OTP_FAILED'
      | 'DATA_EXTRACTION_FAILED'
      | 'NAVIGATION_FAILED'
      | 'TIMEOUT'
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

const PORTAL_BASE = 'https://student.au.edu.pk';
const NAVIGATION_TIMEOUT = 30_000;
const WAIT_TIMEOUT = 10_000;

// Selector candidates — tries each in order, uses first match
const SELECTORS = {
  username: ['#username', 'input[name="username"]', 'input[type="text"]'],
  password: ['#password', 'input[name="password"]', 'input[type="password"]'],
  loginBtn: [
    'button[type="submit"]',
    'input[type="submit"]',
    '.login-btn',
    '#loginBtn',
    'button:has-text("Login")',
    'button:has-text("Sign In")',
  ],
  otpField: ['#otp', 'input[name="otp"]', 'input[placeholder*="OTP" i]', 'input[placeholder*="code" i]'],
  otpSubmit: ['#otpSubmit', 'button[type="submit"]', '.otp-btn'],
  logoutLink: ['a[href*="logout"]', 'a[href*="signout"]', '#logout', '.logout'],
} as const;

async function findAndFill(page: Page, candidates: readonly string[], value: string): Promise<boolean> {
  for (const sel of candidates) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      await page.focus(sel);
      await page.evaluate((s) => {
        const el = document.querySelector(s) as HTMLInputElement | null;
        if (el) el.value = '';
      }, sel);
      await page.type(sel, value, { delay: 30 });
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function findAndClick(page: Page, candidates: readonly string[]): Promise<boolean> {
  for (const sel of candidates) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      await page.click(sel);
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function isOTPRequired(page: Page): Promise<boolean> {
  for (const sel of SELECTORS.otpField) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      return true;
    } catch {
      // not found
    }
  }
  return false;
}

function extractStudentData(html: string): AUStudentData {
  const $ = cheerio.load(html);

  // Generic extraction helpers — try multiple approaches
  const findText = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const el = $(pattern);
      if (el.length) {
        const text = el.first().text().trim();
        if (text) return text;
      }
    }
    return '';
  };

  // Name extraction
  const name =
    findText([
      '.student-name',
      '#studentName',
      'td:contains("Name") + td',
      'th:contains("Name") + td',
      '.profile-name',
      'h2.name',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toLowerCase().includes('name'))
      .find('td')
      .last()
      .text()
      .trim();

  // Registration number extraction
  const registration_number =
    findText([
      '.reg-no',
      '#regNo',
      '#registrationNo',
      'td:contains("Registration") + td',
      'th:contains("Registration") + td',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toLowerCase().includes('registration'))
      .find('td')
      .last()
      .text()
      .trim()
      .replace(/\s+/g, '');

  // Program
  const program =
    findText([
      '.program-name',
      '#program',
      'td:contains("Program") + td',
      'th:contains("Program") + td',
      'td:contains("Degree") + td',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toLowerCase().includes('program'))
      .find('td')
      .last()
      .text()
      .trim();

  // Department
  const department =
    findText([
      '.department',
      '#department',
      'td:contains("Department") + td',
      'th:contains("Department") + td',
      'td:contains("Faculty") + td',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toLowerCase().includes('department'))
      .find('td')
      .last()
      .text()
      .trim();

  // Batch / admission year
  const batchRaw =
    findText([
      '.batch',
      '#batch',
      '#admissionYear',
      'td:contains("Batch") + td',
      'td:contains("Admission") + td',
      'th:contains("Batch") + td',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toLowerCase().includes('batch'))
      .find('td')
      .last()
      .text()
      .trim();

  // Infer batch from registration number if not found (common AU format: 20F-0xxx → batch 2020 Fall)
  const batch =
    batchRaw ||
    (() => {
      const m = registration_number.match(/^(\d{2})([FSW])/i);
      return m ? `20${m[1]} ${m[2].toUpperCase() === 'F' ? 'Fall' : m[2].toUpperCase() === 'S' ? 'Spring' : 'Winter'}` : 'Unknown';
    })();

  // CGPA
  const cgpaRaw =
    findText([
      '.cgpa',
      '#cgpa',
      '#CGPA',
      'td:contains("CGPA") + td',
      'th:contains("CGPA") + td',
      'td:contains("GPA") + td',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toUpperCase().includes('CGPA'))
      .find('td')
      .last()
      .text()
      .trim();
  const cgpa = parseFloat(cgpaRaw) || 0.0;

  // Enrollment status
  const enrollment_status =
    findText([
      '.status',
      '#enrollmentStatus',
      '#studentStatus',
      'td:contains("Status") + td',
      'th:contains("Status") + td',
    ]) || 'Active'; // Default assumption if enrolled and portal accessible

  // Semester count
  const semesterRaw =
    findText([
      '.semester-count',
      '#semesterCount',
      '#currentSemester',
      'td:contains("Semester") + td',
      'th:contains("Semester") + td',
    ]) ||
    $('table tr')
      .filter((_, el) => $(el).text().toLowerCase().includes('semester'))
      .find('td')
      .last()
      .text()
      .trim();
  const semester_count = parseInt(semesterRaw, 10) || 0;

  if (!name || !registration_number) {
    throw new ScraperError(
      'Failed to extract required student data from portal. The portal layout may have changed.',
      'DATA_EXTRACTION_FAILED'
    );
  }

  return {
    name,
    registration_number,
    program: program || 'Unknown Program',
    department: department || 'Unknown Department',
    batch,
    cgpa,
    enrollment_status,
    semester_count,
  };
}

export class AirUniversityPortalScraper {
  async scrapeStudentData(
    username: string,
    password: string,
    otp?: string
  ): Promise<AUStudentData> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1280,800',
        ],
        timeout: NAVIGATION_TIMEOUT,
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
      page.setDefaultTimeout(WAIT_TIMEOUT);

      // Block unnecessary resources to speed up scraping
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // ── NAVIGATE TO PORTAL ──────────────────────────────
      try {
        await page.goto(PORTAL_BASE, { waitUntil: 'networkidle2' });
      } catch {
        throw new ScraperError('Failed to reach the Air University student portal.', 'NAVIGATION_FAILED');
      }

      // ── FILL LOGIN FORM ─────────────────────────────────
      const filledUser = await findAndFill(page, SELECTORS.username, username);
      if (!filledUser) {
        throw new ScraperError('Could not find username field on login page.', 'LOGIN_FAILED');
      }

      const filledPass = await findAndFill(page, SELECTORS.password, password);
      if (!filledPass) {
        throw new ScraperError('Could not find password field on login page.', 'LOGIN_FAILED');
      }

      const clicked = await findAndClick(page, SELECTORS.loginBtn);
      if (!clicked) {
        // Try submitting the form directly
        await page.keyboard.press('Enter');
      }

      // Wait for navigation or OTP page
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
      } catch {
        throw new ScraperError('Login navigation timed out.', 'TIMEOUT');
      }

      // ── CHECK FOR FAILED LOGIN ──────────────────────────
      const pageText = await page.evaluate(() => document.body.innerText);
      const errorIndicators = ['invalid', 'incorrect', 'failed', 'wrong', 'unauthorized', 'error'];
      const hasError = errorIndicators.some((word) =>
        pageText.toLowerCase().includes(word) &&
        pageText.toLowerCase().includes('password')
      );
      if (hasError) {
        throw new ScraperError('Login failed. Invalid username or password.', 'LOGIN_FAILED');
      }

      // ── HANDLE OTP IF REQUIRED ──────────────────────────
      const otpRequired = await isOTPRequired(page);
      if (otpRequired) {
        if (!otp) {
          throw new ScraperError('OTP is required but was not provided.', 'OTP_REQUIRED');
        }

        const filledOtp = await findAndFill(page, SELECTORS.otpField, otp);
        if (!filledOtp) {
          throw new ScraperError('Could not find OTP input field.', 'OTP_FAILED');
        }

        await findAndClick(page, SELECTORS.otpSubmit);
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
        } catch {
          throw new ScraperError('OTP submission timed out.', 'TIMEOUT');
        }

        const afterOtpText = await page.evaluate(() => document.body.innerText);
        if (errorIndicators.some((w) => afterOtpText.toLowerCase().includes(w))) {
          throw new ScraperError('OTP verification failed.', 'OTP_FAILED');
        }
      }

      // ── NAVIGATE TO PROFILE / TRANSCRIPT ────────────────
      // Try common profile/dashboard URLs
      const profileUrls = [
        `${PORTAL_BASE}/student/profile`,
        `${PORTAL_BASE}/profile`,
        `${PORTAL_BASE}/student/dashboard`,
        `${PORTAL_BASE}/dashboard`,
        `${PORTAL_BASE}/student/info`,
        `${PORTAL_BASE}/StudentInfo`,
      ];

      let profileHtml: string | null = null;

      // First, look for profile link in current page
      const profileLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const profileAnchor = links.find(
          (a) =>
            /profile|student\s*info|personal\s*info/i.test(a.textContent || '') ||
            /profile|student-info|personalinfo/i.test(a.href)
        );
        return profileAnchor ? profileAnchor.href : null;
      });

      if (profileLink) {
        try {
          await page.goto(profileLink, { waitUntil: 'networkidle2' });
          profileHtml = await page.content();
        } catch {
          // fall through to URL guessing
        }
      }

      if (!profileHtml) {
        for (const url of profileUrls) {
          try {
            const response = await page.goto(url, { waitUntil: 'networkidle2' });
            if (response && response.ok()) {
              profileHtml = await page.content();
              break;
            }
          } catch {
            // try next
          }
        }
      }

      // Fall back to current page HTML if we couldn't find a separate profile page
      if (!profileHtml) {
        profileHtml = await page.content();
      }

      // ── EXTRACT DATA ─────────────────────────────────────
      const studentData = extractStudentData(profileHtml);

      // ── LOGOUT IMMEDIATELY ───────────────────────────────
      try {
        const logoutClicked = await findAndClick(page, SELECTORS.logoutLink);
        if (!logoutClicked) {
          // Try common logout URLs
          await page.goto(`${PORTAL_BASE}/logout`, { waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        }
      } catch {
        // Logout failure is non-critical — session will expire naturally
      }

      return studentData;
    } finally {
      // ALWAYS close browser — even on error
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
