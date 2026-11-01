# Licenses

Original Quiccie source code uses the Zero-Clause BSD license (`0BSD`). See `LICENSE`.
You can use, change, and distribute this code for any purpose.
You do not have to include an attribution for original Quiccie code.

Dependencies keep their own licenses. Quiccie does not change those licenses.
Release packages must include all required license files and notices.
Do not apply the STE writing rules to legal text from a dependency.

Selected application dependencies use these licenses:

| Dependency | License |
| --- | --- |
| bbolt | MIT |
| Bleve | Apache-2.0 |
| Go crypto packages | BSD-3-Clause |
| Tiptap and ProseMirror | MIT |
| idb | ISC |

The release check must also examine indirect dependencies and Android packages.
A dependency download does not prove that its code is in a release binary.
Record the packages in each release artifact.

## Notice collection

Build the web assets before you collect notices.
Run the Android `licenseArtifacts` task for the release configuration.
Then run `python3 scripts/licenses.py` from the repository root.
The script writes `dist/licenses/inventory.json` and `THIRD_PARTY_NOTICES.txt`.
Include the notices with binary releases. Keep the inventory for release review.

The inventory separates browser runtime candidates, CSS contributors, and build or test tools.
It retains notices for installed packages in each group.
DaisyUI and Tailwind CSS can contribute to the generated CSS.
Their notices remain in the collection even though npm marks them as development dependencies.

Lightning CSS and its native package use MPL-2.0.
They run during the build. The application does not ship their native tool binaries.
The collector retains their MPL text and identifies them as build tools.
It does not change their license or apply 0BSD to them.
Review the distribution terms again if a release includes these tools or changes their source.
See the [Mozilla license FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) for MPL distribution rules.

Some native tool packages do not contain a separate notice file.
For esbuild and Rollup, the collector can use the installed parent package's notice.
It first checks that the version, repository, and license match.
The inventory records that notice source.
The native lzma build tool has no notice file in its installed package.
The inventory and command output report this limit.
Do not distribute that tool with an application release until its notices are complete.

## Limits

The inventory is not a complete analysis of bundled code.
A browser runtime candidate can be removed by the bundler.
A build tool can contribute code or CSS to output.
Check the final artifacts before release. Do not ship `node_modules` as an application artifact.
Keep upstream license text and author attribution unchanged.
The collector checks known npm and Android license labels.
It collects Go module notices but does not classify their license text.
Review those notices before release. A successful command is not legal approval.

Sources:

- <https://opensource.org/license/0bsd>
- <https://www.apache.org/licenses/LICENSE-2.0>
- <https://github.com/etcd-io/bbolt>
- <https://github.com/blevesearch/bleve>
