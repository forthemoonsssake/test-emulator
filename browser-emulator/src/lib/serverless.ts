/**
 * True when this code is running inside a serverless function, where browser
 * binaries and long-lived listeners need a different execution strategy.
 */
function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function isServerless(): boolean {
  return (
    isEnabled(process.env.VERCEL) ||
    isEnabled(process.env.NETLIFY) ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.AWS_LAMBDA_JS_RUNTIME ||
    !!process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_EXECUTION_ENV?.startsWith("AWS_Lambda_") === true
  );
}

