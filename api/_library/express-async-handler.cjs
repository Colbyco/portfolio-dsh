// VENDORED: express-async-handler@1.2.0 (MIT, (c) Alexei Bazhenov), the dependency the original
// index.js required. It is not a root dependency of the portfolio, so its few lines live here.
// Behavior is identical: a rejected promise from the route handler is passed to next(err).
const asyncUtil = fn =>
function asyncUtilWrap(...args) {
  const fnReturn = fn(...args)
  const next = args[args.length-1]
  return Promise.resolve(fnReturn).catch(next)
}

module.exports = asyncUtil
