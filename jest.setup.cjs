const dotenv = require('dotenv');

dotenv.config({ path: 'services/backend/.env' });
dotenv.config({ path: '.env' });

console.log(
  '[JEST ENV] DATABASE_URL:',
  process.env.DATABASE_URL ? 'LOADED' : 'MISSING',
);
