# Interface previews

These images show the running application with synthetic notes.
They contain no imported user notes or agent memory.

- [Desktop, light theme](../docs/images/desktop-light.png)
- [Phone browser, dark theme](../docs/images/phone-dark.png)
- [Native Android, dark theme](../docs/images/android-dark.png)

## Browser capture

Build the web files. Start the temporary demo in one terminal.

```sh
npm --prefix web run build
python3 scripts/demo.py
```

Run the capture in a second terminal.

```sh
node design/capture.cjs
```

The demo uses port 18090. It creates a new temporary database on each run.
The account is `owner`. The test password is `quiccie-test-password`.
Stop the demo with Ctrl+C to remove its temporary data.
Use `--port` to select another local port.
Set `QUICCIE_DEMO_URL` to use that port for browser capture.

## Native Android capture

Use a disposable emulator with serial `emulator-5554`.
The commands below remove local data for the public debug app on that emulator.
Start the demo on port 18090 first.
Set `JAVA_HOME` and `ANDROID_HOME` for your build tools.

```sh
android/gradlew -p android assembleDebug assembleDebugAndroidTest
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell pm clear app.quiccie.android
adb -s emulator-5554 shell am instrument -w -e class app.quiccie.android.PublicPreviewTest app.quiccie.android.test/androidx.test.runner.AndroidJUnitRunner
adb -s emulator-5554 pull /sdcard/Download/quiccie-public-android.png docs/images/android-dark.png
```

The native capture shows the system bars and the application navigation.
The browser capture shows the actual rendered note, table, and task list.
Review every image before publication.
