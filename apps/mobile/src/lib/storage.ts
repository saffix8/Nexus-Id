// Opens the encrypted on-device store once (storage.service.ts owns the logic).
import { storageService } from '../services/storage.service';

let ready: Promise<void> | null = null;

export async function getStorage(): Promise<typeof storageService> {
  if (!ready) {
    ready = storageService.initialize().catch(err => {
      ready = null;
      throw err;
    });
  }
  await ready;
  return storageService;
}
