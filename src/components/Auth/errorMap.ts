/*
  File: errorMap.ts
  Overview: Maps Firebase Auth error messages/codes to friendly, human-readable text.
*/

export function mapFirebaseError(message: string): string {
  const msg = message || '';
  if (msg.includes('auth/invalid-email')) return 'That email looks invalid.';
  if (msg.includes('auth/user-not-found')) return 'No account found for that email.';
  if (msg.includes('auth/wrong-password')) return 'Incorrect password.';
  if (msg.includes('auth/email-already-in-use')) return 'That email is already registered.';
  if (msg.includes('auth/weak-password')) return 'Please use at least 6 characters.';
  if (msg.includes('auth/too-many-requests')) return 'Too many attempts. Please wait and try again.';
  return 'Something went wrong. Please try again.';
}


