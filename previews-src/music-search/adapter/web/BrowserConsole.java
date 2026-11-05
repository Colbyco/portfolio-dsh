package web;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * Browser launcher for the Music Search App preview. NOT part of the original project.
 *
 * <p>The original program is a console application: it reads a directory path from
 * {@code System.in} and prints to {@code System.out} / {@code System.err}. A browser tab has no
 * console, so this class connects those three standard streams to the terminal drawn by the page
 * (via JavaScript native methods provided to CheerpJ) and then calls the original, unmodified
 * {@code controller.MetadataExtractor.main}. Nothing else is changed.
 *
 * <p>When the program finishes, the page offers "Run again", which calls {@code main} again in
 * the same JVM (a native console would need {@code java ...} to be typed again).
 */
public final class BrowserConsole {

    /** Appends text to the page terminal. fd 1 = stdout, fd 2 = stderr. */
    private static native void write(int fd, String text);

    /** Blocks (the promise resolves) until the visitor submits a line; null means end of input. */
    private static native String readLine();

    /** Reports that main returned; blocks until the visitor asks for another run. */
    private static native boolean exited(int status);

    /** Lets the page copy the bundled sample library into the virtual disk before the first run. */
    private static native void prepare();

    private static final PrintStream OUT =
            new PrintStream(new TerminalStream(1), true, StandardCharsets.UTF_8);
    private static final PrintStream ERR =
            new PrintStream(new TerminalStream(2), true, StandardCharsets.UTF_8);

    // ---- File helpers called from JavaScript (CheerpJ's /str/ mount has no directories, so the
    // ---- sample library and any MP3s the visitor picks are written under /files/ instead).

    /** Writes one file (creating parent folders), replacing any previous content. */
    public static void putFile(String path, byte[] data) throws IOException {
        Path p = Paths.get(path);
        if (p.getParent() != null) Files.createDirectories(p.getParent());
        Files.write(p, data);
    }

    /** Deletes a folder tree if it exists (used to forget previously picked files). */
    public static void deleteTree(String path) throws IOException {
        Path root = Paths.get(path);
        if (!Files.exists(root)) return;
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path p : (Iterable<Path>) walk.sorted(Comparator.reverseOrder())::iterator) {
                Files.deleteIfExists(p);
            }
        }
    }

    public static void main(String[] args) {
        prepare();
        System.setOut(OUT);
        System.setErr(ERR);
        System.setIn(new LineStream());
        boolean again;
        do {
            int status = 0;
            try {
                controller.MetadataExtractor.main(args);
            } catch (Throwable t) {
                // What the JVM's default uncaught-exception handler prints before exiting with 1.
                // This launcher's own frame is removed so the trace reads like a native run.
                hideLauncherFrames(t, new java.util.IdentityHashMap<>());
                ERR.print("Exception in thread \"main\" ");
                t.printStackTrace(ERR);
                status = 1;
            }
            OUT.flush();
            ERR.flush();
            again = exited(status);
        } while (again);
    }

    private static void hideLauncherFrames(Throwable t, java.util.Map<Throwable, Boolean> seen) {
        if (t == null || seen.put(t, Boolean.TRUE) != null) return;
        StackTraceElement[] trace = t.getStackTrace();
        for (int i = 0; i < trace.length; i++) {
            // Cut at this launcher's main(): everything below it is browser plumbing.
            if (trace[i].getClassName().equals(BrowserConsole.class.getName())
                    && trace[i].getMethodName().equals("main")) {
                t.setStackTrace(java.util.Arrays.copyOf(trace, i));
                break;
            }
        }
        hideLauncherFrames(t.getCause(), seen);
        for (Throwable s : t.getSuppressed()) hideLauncherFrames(s, seen);
    }

    /** Buffers bytes and hands complete UTF-8 text to the page on flush (println / prompt / exit). */
    private static final class TerminalStream extends OutputStream {
        private final int fd;
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        TerminalStream(int fd) {
            this.fd = fd;
        }

        @Override
        public synchronized void write(int b) {
            buffer.write(b);
        }

        @Override
        public synchronized void write(byte[] b, int off, int len) {
            buffer.write(b, off, len);
        }

        @Override
        public synchronized void flush() {
            if (buffer.size() == 0) return;
            byte[] bytes = buffer.toByteArray();
            int end = completeUtf8Length(bytes);
            BrowserConsole.write(fd, new String(bytes, 0, end, StandardCharsets.UTF_8));
            buffer.reset();
            buffer.write(bytes, end, bytes.length - end); // keep a split multi-byte character
        }

        private static int completeUtf8Length(byte[] b) {
            int n = b.length;
            for (int back = 1; back <= Math.min(3, n); back++) {
                int c = b[n - back] & 0xFF;
                if ((c & 0xC0) == 0x80) continue; // continuation byte
                int need = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1;
                return need > back ? n - back : n;
            }
            return n;
        }
    }

    /** System.in: one line from the page per read, like a line-buffered terminal. */
    private static final class LineStream extends InputStream {
        private byte[] line = new byte[0];
        private int pos = 0;
        private boolean eof = false;

        private boolean fill() {
            if (pos < line.length) return true;
            if (eof) return false;
            OUT.flush(); // show the prompt before waiting, as a terminal does
            ERR.flush();
            String text = readLine();
            if (text == null) {
                eof = true;
                return false;
            }
            line = (text + "\n").getBytes(StandardCharsets.UTF_8);
            pos = 0;
            return true;
        }

        @Override
        public synchronized int read() {
            return fill() ? line[pos++] & 0xFF : -1;
        }

        @Override
        public synchronized int read(byte[] b, int off, int len) {
            if (len == 0) return 0;
            if (!fill()) return -1;
            int n = Math.min(len, line.length - pos);
            System.arraycopy(line, pos, b, off, n);
            pos += n;
            return n;
        }

        @Override
        public synchronized int available() {
            return line.length - pos;
        }
    }
}
