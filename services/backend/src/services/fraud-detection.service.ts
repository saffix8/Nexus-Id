// services/backend/src/services/fraud-detection.service.ts
import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

export interface FraudCheckInput {
  user_id: string;
  credential_id: string;
  verifier_id: string;
  timestamp: string;
  requested_fields: string[];
  device_fingerprint?: string;
}

export interface FraudCheckResult {
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  is_anomaly: boolean;
}

class FraudDetectionService {
  async checkRisk(event: FraudCheckInput): Promise<FraudCheckResult | null> {
    try {
      const { data } = await axios.post(`${ML_SERVICE_URL}/predict-fraud-risk`, {
        verification_event: event,
      }, { timeout: 3000 });
      return {
        risk_score: data.risk_score,
        risk_level: data.risk_level,
        is_anomaly: data.is_anomaly,
      };
    } catch (err) {
      // Fail-open: never block a legitimate verification because the ML
      // service is down. Log and move on, same fail pattern as blockchain.service.
      console.error('[fraud-detection] ML service unreachable, skipping check:', (err as Error).message);
      return null;
    }
  }
}

export default new FraudDetectionService();
