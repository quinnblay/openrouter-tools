import { ExitCode } from "./types.js";

export class CliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exitCode: ExitCode = ExitCode.GENERAL,
    public readonly suggestions?: string[],
  ) {
    super(message);
    this.name = "CliError";
  }

  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
      ...(this.suggestions ? { suggestions: this.suggestions } : {}),
    };
  }
}
