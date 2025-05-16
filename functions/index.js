const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch"); // npm install node-fetch@2
admin.initializeApp();

/**
 * 国会APIのURLを生成します
 * @return {string} APIのURL
 */
function getApiUrl() {
  const today = new Date();
  const until = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const fromDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 1);
  const from = fromDate.toISOString().slice(0, 10);
  return (
    `https://kokkai.ndl.go.jp/api/meeting_list?recordPacking=json` +
    `&maximumRecords=100` +
    `&from=${from}` +
    `&until=${until}`
  );
}
const DOC_PATH = "settings/meeting_notification";

exports.scheduledCheckMeetings = functions.pubsub
    .schedule("every day 12:00").timeZone("Asia/Tokyo")
    .onRun(async (context) => {
      // 1. Firestoreから前回の最新日付を取得
      const docRef = admin.firestore().doc(DOC_PATH);
      const doc = await docRef.get();
      const lastNotifiedDate = doc.exists ? doc.data().lastDate : null;

      // 2. API取得
      const apiUrl = getApiUrl();
      const res = await fetch(apiUrl);
      const data = await res.json();

      // 3. 最新日付を取得（例: "YYYY-MM-DD" 形式）
      const meetings = data.meetingRecord || [];
      if (meetings.length === 0) return null;
      // 例: 日付で降順ソート
      meetings.sort((a, b) => (b.date > a.date ? 1 : -1)); // () で括弧追加済み
      const newest = meetings[0];
      const newestDate = newest.date;
      const sameDateCount =
        meetings.filter((m) => m.date === newestDate).length;
      const formattedBody =
        `${newest.date.replace(/-/g, "/")}` +
        ` ${newest.nameOfHouse}` +
        ` ${newest.nameOfMeeting}` +
        ` ${newest.issue}` +
        (sameDateCount > 1 ?
          ` 等${sameDateCount}件` :
          "");

      // 4. 新しいデータがあれば通知
      if (!lastNotifiedDate || newestDate > lastNotifiedDate) {
        // 全体通知（例: トピック "all"）
        await admin.messaging().send({
          topic: "all",
          notification: {
            title: "新しい会議が公開されました",
            body: formattedBody,
          },
          data: {
            screen: "meeting",
            yearMonth: newestDate.slice(0, 7),
          },
        });
        // Firestoreに最新日付を保存
        await docRef.set({lastDate: newestDate});
      }

      return null;
    });
