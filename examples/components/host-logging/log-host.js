export const log = (level, ctx, message) => {
  switch (level) {
    case 'trace':
    case 'debug':
      console.debug(message);
      break;
    case 'info':
      console.info(message);
      break;
    case 'warn':
      console.warn(message);
      break;
    case 'error':
    case 'critical':
      console.error(message);
      break;
    default:
      console.log(message);
  }
}
