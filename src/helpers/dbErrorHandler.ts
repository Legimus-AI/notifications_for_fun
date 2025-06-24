export const buildErrorMsg = (err: any): string[] => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('El error: ', err);
  }

  const rawErrors: Record<string, any> = err.errors;
  const errors: string[] = [];

  try {
    for (const key in rawErrors) {
      if (rawErrors.hasOwnProperty(key)) {
        const element = rawErrors[key];
        errors.push(element.message);
      }
    }

    if (errors.length === 0) {
      errors.push('Algo salio mal...');
    }
  } catch (error) {
    console.log(error);
  }

  return errors;
};
