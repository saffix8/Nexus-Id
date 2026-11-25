import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CredentialType } from '@nexusid/types';

export type TabParamList = {
  Wallet: undefined;
  History: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  SignIn: undefined;
  Lock: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  CredentialDetail: { credentialId: string };
  AddCredential: { category?: CredentialType } | undefined;
  Scan: undefined;
  Request: { requestId: string };
  Proof: { requestId: string; credentialId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
