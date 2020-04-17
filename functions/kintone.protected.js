const { KintoneRestAPIClient } = require('@kintone/rest-api-client');

function createClient(context) {
  const client = new KintoneRestAPIClient({
    baseUrl: context.KINTONE_BASE_URL,
    auth: {
      apiToken: context.KINTONE_API_TOKEN,
    },
  });
  return client;
}

async function getRecords(context) {
  const client = createClient(context);
  const result = await client.record.getRecords({
    app: context.KINTONE_APP_ID,
  });
  console.log(`getRecords result=${JSON.stringify(result)}`);
  return result.records;
}

async function addRecord(context) {
  const client = createClient(context);
  const result = await client.record.addRecord({
    app: context.KINTONE_APP_ID,
    record: {
      line_display_name: {
        value: 'テストテスト',
      },
      class_name: {
        value: 'test_2',
      },
      score: {
        value: 0.5,
      },
    },
  });
  console.log(`addRecord result=${JSON.stringify(result)}`);
}

module.exports = {
  getRecords,
  addRecord,
};
