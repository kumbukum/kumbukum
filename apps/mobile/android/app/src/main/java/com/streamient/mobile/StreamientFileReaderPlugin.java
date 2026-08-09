package com.streamient.mobile;

import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Arrays;

@CapacitorPlugin(name = "StreamientFileReader")
public class StreamientFileReaderPlugin extends Plugin {
    private static final int MAX_CHUNK_BYTES = 20_000_000;

    @PluginMethod
    public void stat(PluginCall call) {
        String rawUri = call.getString("uri", "");
        try {
            long size = resolveSize(rawUri);
            if (size < 0) {
                call.reject("The shared file size is unavailable");
                return;
            }
            JSObject result = new JSObject();
            result.put("size", size);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Unable to inspect the shared file", exception);
        }
    }

    @PluginMethod
    public void readChunk(PluginCall call) {
        String rawUri = call.getString("uri", "");
        long offset = call.getLong("offset", 0L);
        int requestedLength = call.getInt("length", 0);
        if (offset < 0 || requestedLength < 1 || requestedLength > MAX_CHUNK_BYTES) {
            call.reject("Invalid chunk range");
            return;
        }
        try (InputStream input = openInput(rawUri)) {
            skipFully(input, offset);
            byte[] buffer = new byte[requestedLength];
            int total = 0;
            while (total < requestedLength) {
                int read = input.read(buffer, total, requestedLength - total);
                if (read < 0) break;
                total += read;
            }
            byte[] value = total == buffer.length ? buffer : Arrays.copyOf(buffer, total);
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(value, Base64.NO_WRAP));
            result.put("bytesRead", total);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Unable to read the shared file", exception);
        }
    }

    private InputStream openInput(String rawUri) throws Exception {
        Uri uri = Uri.parse(rawUri);
        if (uri.getScheme() == null || "file".equals(uri.getScheme())) return new FileInputStream(uri.getScheme() == null ? rawUri : uri.getPath());
        InputStream input = getContext().getContentResolver().openInputStream(uri);
        if (input == null) throw new IllegalArgumentException("Shared URI cannot be opened");
        return input;
    }

    private long resolveSize(String rawUri) throws Exception {
        Uri uri = Uri.parse(rawUri);
        if (uri.getScheme() == null || "file".equals(uri.getScheme())) return new File(uri.getScheme() == null ? rawUri : uri.getPath()).length();
        try (ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r")) {
            if (descriptor != null && descriptor.getStatSize() >= 0) return descriptor.getStatSize();
        }
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getLong(0);
        }
        return -1;
    }

    private void skipFully(InputStream input, long bytes) throws Exception {
        long remaining = bytes;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped > 0) {
                remaining -= skipped;
                continue;
            }
            if (input.read() < 0) throw new IllegalArgumentException("Chunk offset exceeds the shared file");
            remaining--;
        }
    }
}
