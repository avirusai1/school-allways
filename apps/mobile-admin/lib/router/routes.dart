abstract final class AdminRoutes {
  static const splash = '/';
  static const login = '/login';
  static const otp = '/login/otp';
  static const emailLogin = '/login/email';
  static const selectSchool = '/select-school';

  static const home = '/home';
  static const attendance = '/attendance';
  static const takeAttendance = '/attendance/mark';
  static const attendanceOverview = '/attendance/overview';
  static const students = '/students';
  static const myClass = '/my-class';
  static const homework = '/homework';
  static const composeHomework = '/homework/compose';
  static const diary = '/diary';
  static const messages = '/messages';
  static String messageThread(String id) => '/messages/$id';
  static const more = '/more';
  static const settings = '/settings';
  static const marksEntry = '/marks';
  static const timetable = '/timetable';
  static const leave = '/leave';
  static const approvals = '/approvals';
  static const gateScanner = '/gate';
  static const verifyPickup = '/gate/verify';
  static const driverHome = '/driver';
  static const scanBoarding = '/driver/boarding';
  static const sos = '/driver/sos';
  static const collectFee = '/fees/collect';
  static const subscriptions = '/subscriptions';
}
