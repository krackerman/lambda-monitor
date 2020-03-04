const LRU = require('lru-cache-ext');
const Lambda = require('./lambda');

const lambda = Lambda();
const lru = new LRU({ maxAge: 60 * 60 * 1000 });

module.exports.isRequestStartOrEnd = (() => {
  const requestStartRegex = new RegExp([
    /^START RequestId: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} /,
    /Version: (\$LATEST|\d+)\n$/
  ].map((r) => r.source).join(''), '');
  const requestEndRegex = new RegExp([
    /^END RequestId: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n$/
  ].map((r) => r.source).join(''), '');
  return (message) => message.match(requestEndRegex) || message.match(requestStartRegex);
})();

module.exports.extractExecutionReport = (() => {
  const reportRegex = new RegExp([
    /^/,
    /REPORT RequestId: (?<requestId>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\t/,
    /Duration: (?<duration>\d+.\d+) ms\t/,
    /Billed Duration: (?<billedDuration>\d+) ms\t/,
    /Memory Size: (?<memory>\d+) MB\t/,
    /Max Memory Used: (?<maxMemory>\d+) MB\t/,
    /(?:Init Duration: (?<initDuration>\d+.\d+) ms\t)?/,
    /\n/,
    // https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html
    // eslint-disable-next-line max-len
    /(?:XRAY TraceId: (?<traceId>\d+-[0-9a-f]{8}-[0-9a-f]{24})\tSegmentId: (?<segmentId>[0-9a-f]{16})\tSampled: (?<sampled>true|false)\t\n)?/,
    /$/
  ].map((r) => r.source).join(''), '');
  return async (resultParsed, logEvent) => {
    const requestLog = reportRegex.exec(logEvent.message);
    if (!requestLog) {
      return null;
    }
    const {
      duration, billedDuration, maxMemory, requestId, memory, initDuration, traceId, segmentId, sampled
    } = requestLog.groups;
    const fnName = resultParsed.logGroup.replace(/^\/aws\/lambda\//, '');
    const info = await lru.memoize(
      `${resultParsed.logStream}-${fnName}`,
      () => lambda.getFunctionConfiguration(fnName)
    );
    return {
      message: logEvent.message,
      logGroupName: resultParsed.logGroup,
      logStreamName: resultParsed.logStream,
      owner: resultParsed.owner,
      timestamp: new Date(logEvent.timestamp).toISOString(),
      requestId,
      duration: parseFloat(duration),
      timeout: info.Timeout,
      codeSize: info.CodeSize,
      billedDuration: parseInt(billedDuration, 10),
      maxMemory: parseInt(maxMemory, 10),
      memory: parseInt(memory, 10),
      initDuration: initDuration === undefined ? null : parseFloat(initDuration),
      traceId: traceId === undefined ? null : traceId,
      segmentId: segmentId === undefined ? null : segmentId,
      sampled: sampled === undefined ? null : sampled,
      env: process.env.ENVIRONMENT
    };
  };
})();

module.exports.extractLogMessage = (() => {
  const messageRegex = new RegExp([
    /^/,
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z[\s\t]/,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[\s\t]/,
    /(?:(?:ERROR|INFO)[\s\t])?/,
    /(?:(?<logLevel>DEBUG|INFO|WARNING|ERROR|CRITICAL): )?/,
    /(?<message>[\s\S]*)/,
    /$/
  ].map((r) => r.source).join(''), '');

  return (message, logGroup) => {
    const messageParsed = messageRegex.exec(message);
    if (messageParsed) {
      return {
        logLevel: (messageParsed.groups.logLevel || 'WARNING').toLowerCase(),
        message: messageParsed.groups.message.replace(
          /^Task timed out after (\d+\.\d)\d seconds/,
          `${logGroup.replace(/^\/aws\/lambda\//, '')}: Task timed out after $1\u0030 seconds`
        )
      };
    }
    return {
      logLevel: 'WARNING'.toLowerCase(),
      message
    };
  };
})();
