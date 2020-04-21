'use strict';

const { KintoneRestAPIClient } = require('@kintone/rest-api-client');
const debug = require('debug')('grampus:kintone');

function createClassifiedAppClient(context) {
  const client = new KintoneRestAPIClient({
    baseUrl: context.KINTONE_BASE_URL,
    auth: {
      apiToken: context.KINTONE_CLASSIFIED_APP_API_TOKEN,
    },
  });
  return client;
}

async function getClassifiedAppRecords(context) {
  const client = createClassifiedAppClient(context);
  const result = await client.record.getRecords({
    app: context.KINTONE_CLASSIFIED_APP_ID,
  });
  return result.records;
}

async function addClassifiedAppRecord(context, record) {
  const client = createClassifiedAppClient(context);
  const result = await client.record.addRecord({
    app: context.KINTONE_CLASSIFIED_APP_ID,
    record: {
      line_user_id: {
        value: record.lineUserId,
      },
      class_name: {
        value: record.className,
      },
      score: {
        value: record.score,
      },
    },
  });
  const records = await getClassifiedAppRecords(context);
  debug(`classifiedAppRecords=${JSON.stringify(records)}`);
  return result;
}

function createUserClient(context) {
  const client = new KintoneRestAPIClient({
    baseUrl: context.KINTONE_BASE_URL,
    auth: {
      apiToken: context.KINTONE_USER_APP_API_TOKEN,
    },
  });
  return client;
}

async function getUserAppRecords(context) {
  const client = createUserClient(context);
  const result = await client.record.getRecords({
    app: context.KINTONE_USER_APP_ID,
  });
  return result.records;
}

async function upsertUserAppRecord(context, record) {
  const client = createUserClient(context);
  const result = await client.record.upsertRecord({
    app: context.KINTONE_USER_APP_ID,
    updateKey: {
      field: 'line_user_id',
      value: record.lineUserId,
    },
    record: {
      line_display_name: {
        value: record.lineDisplayName,
      },
      line_picture_url: {
        value: record.linePictureUrl,
      },
      line_user_language: {
        value: record.lineUserLanguage,
      },
    },
  });
  const records = await getUserAppRecords(context);
  debug(`classifiedAppRecords=${JSON.stringify(records)}`);
  return result;
}

module.exports = {
  getClassifiedAppRecords,
  addClassifiedAppRecord,
  getUserAppRecords,
  upsertUserAppRecord,
};
