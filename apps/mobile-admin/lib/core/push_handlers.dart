import 'package:core_push/core_push.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../router/app_router.dart';
import 'providers.dart';

Future<void> handleAdminPushTap(WidgetRef ref, PushTapTarget target) async {
  ref.read(adminRouterProvider).go(target.route);
}

void showAdminForegroundPush(WidgetRef ref, PushForegroundMessage message) {
  final text = message.body ?? message.title;
  if (text == null || text.isEmpty) return;
  ref.read(scaffoldMessengerKeyProvider).currentState?.showSnackBar(
        SnackBar(
          content: Text(text),
          action: SnackBarAction(
            label: 'Open',
            onPressed: () {
              handleAdminPushTap(ref, message.target);
            },
          ),
        ),
      );
}
