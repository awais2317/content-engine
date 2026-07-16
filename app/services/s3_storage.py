import os
import json
from typing import Optional
from loguru import logger
import boto3
from botocore.exceptions import ClientError


class S3Storage:
    def __init__(self):
        self.enabled = os.getenv('S3_ENABLED', 'false').lower() == 'true'
        self.bucket_name = os.getenv('S3_BUCKET_NAME')
        self.region = os.getenv('AWS_REGION', 'eu-north-1')
        self.access_key = os.getenv('AWS_ACCESS_KEY_ID')
        self.secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
        self.client = None

        if self.enabled and not all([self.bucket_name, self.access_key, self.secret_key]):
            logger.warning('S3 enabled but missing credentials or bucket name')
            self.enabled = False

        if self.enabled:
            try:
                self.client = boto3.client(
                    's3',
                    aws_access_key_id=self.access_key,
                    aws_secret_access_key=self.secret_key,
                    region_name=self.region,
                )
                logger.info(f'S3 storage initialized: bucket={self.bucket_name}, region={self.region}')
            except Exception as e:
                logger.error(f'Failed to initialize S3 client: {e}')
                self.enabled = False

    def upload_file(self, local_file_path: str, s3_key: str) -> Optional[str]:
        # Uploads file to S3. Returns the s3_key on success (NOT a signed URL).
        # Use get_signed_url(s3_key) to generate a fresh access URL on demand.
        if not self.enabled or not self.client:
            return None
        if not os.path.exists(local_file_path):
            logger.error(f'File not found for upload: {local_file_path}')
            return None
        try:
            file_size = os.path.getsize(local_file_path)
            logger.info(f'Uploading to S3: {s3_key} ({file_size} bytes)')
            self.client.upload_file(
                local_file_path,
                self.bucket_name,
                s3_key,
                ExtraArgs={'ContentType': 'video/mp4'}
            )
            logger.info(f'Successfully uploaded to S3: {s3_key}')
            return s3_key
        except ClientError as e:
            logger.error(f'S3 upload failed for {s3_key}: {e}')
            return None
        except Exception as e:
            logger.error(f'Unexpected error during S3 upload: {e}')
            return None

    def upload_json(self, data: dict, s3_key: str) -> bool:
        # Upload a dict as a JSON file to S3.
        if not self.enabled or not self.client:
            return False
        try:
            body = json.dumps(data, indent=2).encode('utf-8')
            self.client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=body,
                ContentType='application/json'
            )
            logger.info(f'Uploaded metadata JSON to S3: {s3_key}')
            return True
        except Exception as e:
            logger.error(f'Failed to upload JSON to S3 {s3_key}: {e}')
            return False

    def get_signed_url(self, s3_key: str, expires_in: int = 604800) -> Optional[str]:
        # Generate a FRESH presigned URL (7 days = AWS max for IAM keys).
        # Always call this on-demand so the URL is never stale.
        if not self.enabled or not self.client:
            return None
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': s3_key},
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            logger.error(f'Failed to generate signed URL for {s3_key}: {e}')
            return None
        except Exception as e:
            logger.error(f'Unexpected error generating signed URL: {e}')
            return None

    def build_s3_uri(self, s3_key: str) -> str:
        # Build an internal s3:// URI. Store this in metadata; never the signed URL.
        return f's3://{self.bucket_name}/{s3_key}'

    def key_from_uri(self, s3_uri: str) -> Optional[str]:
        # Extract S3 key from an s3:// URI.
        prefix = f's3://{self.bucket_name}/'
        if s3_uri.startswith(prefix):
            return s3_uri[len(prefix):]
        if s3_uri.startswith('s3://'):
            parts = s3_uri[5:].split('/', 1)
            return parts[1] if len(parts) == 2 else None
        return None

    def url_from_uri(self, s3_uri: str) -> Optional[str]:
        # Generate a fresh signed URL from an s3:// URI.
        key = self.key_from_uri(s3_uri)
        if key:
            return self.get_signed_url(key)
        return None


_s3_storage = None


def get_s3_storage() -> S3Storage:
    global _s3_storage
    if _s3_storage is None:
        _s3_storage = S3Storage()
    return _s3_storage
