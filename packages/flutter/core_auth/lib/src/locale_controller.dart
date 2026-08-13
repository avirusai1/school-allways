import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _localeKey = 'saw.locale';

/// Persisted UI language (`en` | `hi`). Sent as Accept-Language by ApiClient.
class LocaleController extends StateNotifier<String> {
  LocaleController(this._prefs, {String initial = 'en'}) : super(initial);

  final SharedPreferences _prefs;

  static Future<LocaleController> create() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_localeKey);
    final initial = (saved == 'hi' || saved == 'en') ? saved! : 'en';
    return LocaleController(prefs, initial: initial);
  }

  Future<void> setLocale(String code) async {
    if (code != 'en' && code != 'hi') return;
    await _prefs.setString(_localeKey, code);
    state = code;
  }
}

/// Override in ProviderScope after [LocaleController.create].
final localeControllerProvider =
    StateNotifierProvider<LocaleController, String>((ref) {
  throw UnimplementedError('Override localeControllerProvider in bootstrap');
});

/// Convenience read used by ApiClient Accept-Language.
final localeProvider = Provider<String>((ref) {
  return ref.watch(localeControllerProvider);
});
