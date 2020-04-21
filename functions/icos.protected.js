'use strict';

const icos = require('ibm-cos-sdk');
const debug = require('debug')('grampus:icos');

function createClient(context) {
  const client = new icos.S3({
    endpoint: context.ICOS_ENDPOINT,
    apiKeyId: context.ICOS_API_KEY,
    ibmAuthEndpoint: 'https://iam.ng.bluemix.net/oidc/token',
    serviceInstanceId: context.ICOS_RESOURCE_ID,
  });
  return client;
}

async function putImage(context, filename, img) {
  const client = createClient(context);
  const imageUrl = `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${filename}`;
  debug(`putImage: url=${imageUrl}`);
  await client
    .putObject({
      Bucket: context.ICOS_BUCKET_NAME,
      Key: filename,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
      Body: img,
    })
    .promise();
  return imageUrl;
}

module.exports = {
  putImage,
};
