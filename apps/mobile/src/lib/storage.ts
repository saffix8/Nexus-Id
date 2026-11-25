// Opens the encrypted on-device store (storage.service.ts owns the logic).
//
// initialize() is a no-op while the key is loaded, so it is called on every access:
// sign-out runs clearAllData(), which drops the key, and the next sign-in must reopen
// the store. (A cached "already opened" promise caused StorageNotInitializedError
// after sign-out → sign-in until the app was restarted.) Only the in-flight open is
// shared, so two parallel first calls cannot create two different keys.
import { storageService } from '../services/storage.service';

let opening: Promise<void> | null = null;

export async function getStorage(): Promise<typeof storageService> {
  if (!opening) {
    opening = storageService.initialize().finally(() => {
      opening = null;
    });
  }
  await opening;
  return storageService;
}
