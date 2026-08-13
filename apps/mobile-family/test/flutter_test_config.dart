import 'package:google_fonts/google_fonts.dart';

/// Widget tests must not hit the network for Inter/Noto.
Future<void> testExecutable(Future<void> Function() testMain) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  await testMain();
}
