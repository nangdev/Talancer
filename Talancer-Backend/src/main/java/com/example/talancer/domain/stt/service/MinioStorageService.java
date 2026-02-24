package com.example.talancer.domain.stt.service;

import io.minio.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;

@Service
@RequiredArgsConstructor
public class MinioStorageService {
    private final MinioClient minioClient;

    @Value("${minio.bucket}")
    private String bucket;

    public void upload(String objectKey, InputStream stream, long size, String contentType) {
        try {
            ensureBucket();
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectKey)
                            .stream(stream, size, -1)
                            .contentType(contentType)
                            .build()
            );
        }
        catch (Exception e) {
            throw new RuntimeException("Failed to upload object to MinIO", e);
        }
    }

    public byte[] getObjectBytes(String objectKey) {
        try (InputStream in = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectKey).build()
        )) {
            return in.readAllBytes();
        }
        catch (Exception e) {
            throw new RuntimeException("Failed to read object from MinIO", e);
        }
    }

    private void ensureBucket() throws Exception {
        boolean found = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!found) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
    }
}
