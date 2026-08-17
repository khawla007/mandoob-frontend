/**
 * Runs privileged work only after authorization. Authorization failures are
 * deliberately outside the compensation catch and therefore propagate.
 */
export async function runAuthorizedMutation<Context, Result>(args: {
  authorize: () => Promise<Context>;
  run: (context: Context) => Promise<Result>;
  compensate: (context: Context, error: unknown) => Promise<void>;
  recover: (error: unknown) => Result;
}): Promise<Result> {
  const context = await args.authorize();
  try {
    return await args.run(context);
  } catch (error) {
    await args.compensate(context, error);
    return args.recover(error);
  }
}
