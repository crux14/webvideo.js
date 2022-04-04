export enum LogLevel {
  TRACE = 0,
  DEBUG,
  INFO,
  WARN,
  ERROR,
}

enum LogColor {
  BLACK = '\u001b[30m',
  RED = '\u001b[31m',
  GREEN = '\u001b[32m',
  YELLOW = '\u001b[33m',
  BLUE = '\u001b[34m',
  MAGENTA = '\u001b[35m',
  CYAN = '\u001b[36m',
  WHITE = '\u001b[37m',
  NONE = '',
}

function colorize(msg: string, color: LogColor): string {
  if (color === LogColor.NONE) {
    return msg;
  } else {
    const reset = '\u001b[0m';
    return color + msg + reset;
  }
}

function headerStr(header?: string): string {
  return header ? `[${header}]` : '';
}

const GLOBAL_LOGLEVEL = {
  loglevel: LogLevel.WARN,
};

function setLevel(level: LogLevel) {
  if (typeof self !== 'undefined') {
    // @ts-ignore
    self.__wv_global_loglevel = level;
  }
  GLOBAL_LOGLEVEL.loglevel = level;
}

function getLevel(): LogLevel {
  if (self) {
    // @ts-ignore
    return self.__wv_global_loglevel;
  } else {
    return GLOBAL_LOGLEVEL.loglevel;
  }
}

function log(level: LogLevel, msg: string, header?: string) {
  if (level < getLevel()) {
    return;
  }

  let fn = console.log;
  let color = LogColor.NONE;
  switch (level) {
    case LogLevel.TRACE: {
      fn = console.log;
      color = LogColor.WHITE;
      break;
    }
    case LogLevel.DEBUG: {
      fn = console.debug;
      color = LogColor.CYAN;
      break;
    }
    case LogLevel.INFO: {
      fn = console.info;
      color = LogColor.GREEN;
      break;
    }
    case LogLevel.WARN: {
      fn = console.warn;
      break;
    }
    case LogLevel.ERROR: {
      fn = console.error;
      break;
    }
  }

  fn(colorize([headerStr(header), msg].filter((x) => x).join(' '), color));
}

function trace(msg: string, header?: string): void {
  log(LogLevel.TRACE, msg, header);
}

function debug(msg: string, header?: string): void {
  log(LogLevel.DEBUG, msg, header);
}

function info(msg: string, header?: string): void {
  log(LogLevel.INFO, msg, header);
}

function warn(msg: string, header?: string): void {
  log(LogLevel.WARN, msg, header);
}

function error(msg: string, header?: string): void {
  log(LogLevel.ERROR, msg, header);
}

export const logger = {
  setLevel,
  trace,
  debug,
  info,
  warn,
  error,
};
