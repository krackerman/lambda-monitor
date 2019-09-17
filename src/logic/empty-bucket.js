const get = require('lodash.get');
const { logger } = require('lambda-monitor-logger');
const cfnResponse = require('./util/cfn-response-wrapper');
const s3 = require('./util/s3');

module.exports = cfnResponse.wrap((event, context, callback) => new Promise((resolve, reject) => {
  const requestType = get(event, 'RequestType');
  if (requestType === 'Delete') {
    const Bucket = get(event, 'ResourceProperties.BucketName');
    if (Bucket === undefined) {
      return reject(new Error('No Bucket Provided.'));
    }
    return s3.emptyBucket({ Bucket })
      .then(() => {
        logger.info(`${Bucket} emptied!`);
        resolve();
      })
      .catch(reject);
  }
  return resolve();
}).then(() => callback(null, 'Done.')).catch(callback));
