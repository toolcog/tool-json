/**
 * Initialization options for JSON processing errors.
 *
 * @category Node
 */
export interface ProcessingErrorOptions extends ErrorOptions {
  /**
   * A URI that uniquely identifies the location of the error.
   */
  location?: string | undefined;
}

/**
 * An error that occurs while processing JSON trees.
 *
 * @category Node
 */
export class ProcessingError extends Error {
  /**
   * A URI that uniquely identifies the location of the error.
   */
  location: string | undefined;

  constructor(message?: string, options?: ProcessingErrorOptions) {
    super(message, options);
    this.location = options?.location;
  }
}

/**
 * An error that occurs when resolving JSON references.
 *
 * @category Node
 */
export class ResolutionError extends ProcessingError {}
