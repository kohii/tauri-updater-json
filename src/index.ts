#!/usr/bin/env node

import { program } from "commander";
import { resolve } from "node:path";
import { readTauriConfig } from "./config.js";
import {
  findArtifacts,
  copyArtifactToOutput,
  getSearchDirectories,
} from "./artifacts.js";
import { generateLatestJson, writeLatestJson } from "./generator.js";
import type { CliOptions } from "./types.js";

program
  .name("tauri-updater-json")
  .description("Generate latest.json for Tauri v2 updater")
  .requiredOption(
    "--tauri-project <path>",
    "Path to Tauri project directory"
  )
  .requiredOption(
    "--output-dir <path>",
    "Output directory for latest.json and artifacts"
  )
  .requiredOption(
    "--base-url <url>",
    "Base URL for artifact downloads (supports {version} placeholder)"
  )
  .option("--notes <string>", "Release notes")
  .option(
    "--allow-overwrite-platforms",
    "Allow overwriting existing platform entries in latest.json"
  )
  .action(async (opts) => {
    const options: CliOptions = {
      tauriProject: resolve(opts.tauriProject),
      outputDir: resolve(opts.outputDir),
      baseUrl: opts.baseUrl,
      notes: opts.notes,
      allowOverwritePlatforms: opts.allowOverwritePlatforms,
    };

    try {
      // Read version from Tauri config
      console.log("Reading Tauri configuration...");
      const version = await readTauriConfig(options.tauriProject);
      console.log(`Version: ${version}`);

      // Find build artifacts
      console.log("Searching for build artifacts...");
      const searchDirectories = await getSearchDirectories(
        options.tauriProject
      );
      console.log("Search directories:");
      for (const dir of searchDirectories) {
        console.log(`  - ${dir}`);
      }
      const artifacts = await findArtifacts(options.tauriProject);

      if (artifacts.length === 0) {
        console.error(
          "No artifacts found. Make sure you have built the Tauri app with updater artifacts enabled."
        );
        process.exit(1);
      }

      console.log(`Found ${artifacts.length} artifact(s):`);
      for (const artifact of artifacts) {
        console.log(`  - ${artifact.os}-${artifact.arch} (${artifact.bundle}): ${artifact.fileName}`);
      }

      // Copy artifacts to output directory
      console.log("\nCopying artifacts to output directory...");
      for (const artifact of artifacts) {
        await copyArtifactToOutput(artifact, options.outputDir);
        console.log(`  Copied: ${artifact.fileName}`);
      }

      // Generate latest.json
      console.log("\nGenerating latest.json...");
      const latestJson = await generateLatestJson(
        artifacts,
        version,
        options.baseUrl,
        options.outputDir,
        options.notes,
        options.allowOverwritePlatforms
      );

      await writeLatestJson(latestJson, options.outputDir);
      console.log("Generated latest.json");

      console.log("\nDone!");
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("An unexpected error occurred");
      }
      process.exit(1);
    }
  });

program.parse();
