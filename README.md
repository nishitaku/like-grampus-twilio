# LIKE GRAMPUS deployed to Twilio functions

## IBM CLOUD

- トークン取得

```
curl -k -X POST --header "Content-Type: application/x-www-form-urlencoded" --header "Accept: application/json" --data-urlencode "grant_type=urn:ibm:params:oauth:grant-type:apikey" --data-urlencode "apikey=${APIKEY}" "https://iam.cloud.ibm.com/identity/token"
```

- Cloud Object Storage へ公開画像登録

```
curl -X PUT https://${BUCKET_NAME}.s3.jp-tok.cloud-object-storage.appdomain.cloud/filename.jpg -H "x-amz-acl: public-read" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: image/jpeg" -T local_filename.jpg
```
