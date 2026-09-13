export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: "A jelszó megadása kötelező." };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `A jelszónak legalább ${PASSWORD_MIN_LENGTH} karakternek kell lennie.`,
    };
  }

  if (!PASSWORD_REGEX.test(password)) {
    return {
      valid: false,
      error: "A jelszónak tartalmaznia kell nagybetűt, kisbetűt, számot és speciális karaktert (@$!%*?&).",
    };
  }

  return { valid: true };
}
