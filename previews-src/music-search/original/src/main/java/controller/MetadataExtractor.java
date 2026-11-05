package controller;

import com.mpatric.mp3agic.Mp3File;
import model.SongDetails;

import java.util.HashMap;
import java.util.List;
import java.util.Scanner;

import static util.FileUtils.getMp3Files;

public class MetadataExtractor {
    public static void main(String[] args) {

        Scanner scanner = new Scanner(System.in);

        // Reading a string
        System.out.print("Enter path to directory: ");

        HashMap<SongDetails, Mp3File> mp3Files = getMp3Files(List.of(scanner.nextLine()));
    }
}
