/* eslint-disable no-console */
const path = require('path');
const expect = require('chai').expect;
const nockBack = require('nock').back;
const response = require('../../../src/logic/util/cfn-response-wrapper');

const sampleEvent = {
  RequestType: 'Create',
  ServiceToken: 'arn:aws:lambda:...:function:route53Dependency',
  ResponseURL: 'https://requestb.in/1b23n7c1',
  StackId: 'arn:aws:cloudformation:eu-west-1:...',
  RequestId: 'afd8d7c5-9376-4013-8b3b-307517b8719e',
  LogicalResourceId: 'Route53',
  ResourceType: 'Custom::Route53Dependency',
  ResourceProperties: {
    ServiceToken: 'arn:aws:lambda:...:function:route53Dependency',
    DomainName: 'example.com'
  }
};

const logs = [];
const consoleLogOriginal = console.log;
nockBack.setMode('record');

const doTest = (errObject, respObject, status, done) => {
  nockBack(`cfb-response-wrapper-callback-${status.toLowerCase()}.json_recording.json`, {}, (nockDone) => {
    response.wrap((event, context, callback, rb) => {
      expect(rb).to.equal('rb');
      callback(errObject, respObject);
    })(sampleEvent, {}, (err, resp) => {
      expect(err).to.equal(errObject);
      expect(resp).to.equal(respObject);
      expect(logs).to.deep.equal([
        'Response body:\n',
        `{"Status":"${status.toUpperCase()}","Reason":"See the details in CloudWatch Log Stream: undefined",`
        + '"StackId":"arn:aws:cloudformation:eu-west-1:...","RequestId":"afd8d7c5-9376-4013-8b3b-307517b8719e",'
        + '"LogicalResourceId":"Route53","Data":{}}',
        'Status code: 200',
        'Status message: null'
      ]);
      nockDone();
      done();
    }, 'rb');
  });
};

describe('Testing cfn-response-wrapper', () => {
  before(() => {
    nockBack.fixtures = path.join(__dirname, '__cassette');
    console.log = (...args) => {
      logs.push(...args);
    };
  });
  after(() => {
    console.log = consoleLogOriginal;
  });

  beforeEach(() => {
    logs.length = 0;
  });

  it('Testing Callback Execution Success', (done) => {
    doTest(null, 'response', 'SUCCESS', done);
  });

  it('Testing Callback Execution Failure', (done) => {
    doTest('err', undefined, 'FAILED', done);
  });
});
