export function createContextMiddleware({ env, logger, services }) {
  return async (ctx, next) => {
    ctx.state.env = env;
    ctx.state.services = services;
    ctx.state.logger = logger;
    ctx.state.requestLogger = ctx.state.requestLogger ?? logger;

    await next();
  };
}
