package util;

import com.mpatric.mp3agic.*;
import model.SongDetails;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;

public class FileUtils {
    public static HashMap<SongDetails, Mp3File> getMp3Files(List<String> directoryList) {

        HashMap<SongDetails, Mp3File> songMap = new HashMap<>();

        for(String directoryPath : directoryList) {
            try {
                Files.walkFileTree(Paths.get(directoryPath), new SimpleFileVisitor<Path>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                        System.out.println("File: " + file.toString());
                        try {
                            Mp3File mp3File = new Mp3File(file);
                            addSongToMap(mp3File, songMap);
                        } catch (UnsupportedTagException | InvalidDataException e) {
                            throw new RuntimeException(e);
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                        System.out.println("Directory: " + dir.toString());
                        return FileVisitResult.CONTINUE;
                    }
                });
            }
            catch (IOException e) {
                System.err.println("Error reading directory: " + e.getMessage());
            }
        }

        return songMap;
    }

    public static void addSongToMap(Mp3File mp3File, HashMap<SongDetails, Mp3File> songMap) {
        try {
            if (mp3File.hasId3v1Tag()) {
                ID3v1 id3v1Tag = mp3File.getId3v1Tag();
                System.out.println("ID3v1 Metadata:");
                System.out.println("Title: " + id3v1Tag.getTitle());
                System.out.println("Artist: " + id3v1Tag.getArtist());
                System.out.println("Album: " + id3v1Tag.getAlbum());
                System.out.println("Year: " + id3v1Tag.getYear());
                System.out.println("Genre: " + id3v1Tag.getGenreDescription());
                System.out.println();

                SongDetails songDetails = new SongDetails(id3v1Tag.getTitle(), id3v1Tag.getArtist());

                songMap.put(songDetails, mp3File);
            }

            // Check for ID3v2 tag and extract metadata
            if (mp3File.hasId3v2Tag()) {
                ID3v2 id3v2Tag = mp3File.getId3v2Tag();
                System.out.println("ID3v2 Metadata:");
                System.out.println("Title: " + id3v2Tag.getTitle());
                System.out.println("Artist: " + id3v2Tag.getArtist());
                System.out.println("Album: " + id3v2Tag.getAlbum());
                System.out.println("Year: " + id3v2Tag.getYear());
                System.out.println("Genre: " + id3v2Tag.getGenreDescription());
                System.out.println("Comment: " + id3v2Tag.getComment());
                System.out.println("Track: " + id3v2Tag.getTrack());
                System.out.println();

                SongDetails songDetails = new SongDetails(id3v2Tag.getTitle(), id3v2Tag.getArtist());

                songMap.put(songDetails, mp3File);
            }

            // Extract additional properties
            System.out.println("Other Properties:");
            System.out.println("Length: " + mp3File.getLengthInSeconds() + " seconds");
            System.out.println("Bitrate: " + mp3File.getBitrate() + " kbps");
            System.out.println("Sample Rate: " + mp3File.getSampleRate() + " Hz");
            System.out.println("Channel Mode: " + mp3File.getChannelMode());
        } catch (Exception e) {
            System.err.println("Error reading MP3 file: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
