import React from 'react';
import { CircleX } from 'lucide-react-native';
import { colors } from '../styles/tokens';
import { EmptyState } from './EmptyState';

/** Error: specific message from the API + Retry (§7). */
export function ErrorState({ title = "Couldn't load this", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <EmptyState Icon={CircleX} iconColor={colors.danger} title={title} body={message} actionLabel={onRetry ? 'Retry' : undefined} onAction={onRetry} />;
}
