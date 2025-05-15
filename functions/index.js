const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch"); // npm install node-fetch@2
admin.initializeApp();

const API_URL =
  "https://kokkai.ndl.go.jp/api/meeting_list?recordPacking=json" +
  "&nameOfMeeting=%E6%9C%AC%E4%BC%9A%E8%AD%B0";
const DOC_PATH = "settings/meeting_notification";

exports.scheduledCheckMeetings = functions.pubsub
    .schedule("every day 12:00").timeZone("Asia/Tokyo")
    .onRun(async (context) => {
      // 1. Firestoreから前回の最新日付を取得
      const docRef = admin.firestore().doc(DOC_PATH);
      const doc = await docRef.get();
      const lastNotifiedDate = doc.exists ? doc.data().lastDate : null;

      // 2. API取得
      const res = await fetch(API_URL);
      const data = await res.json();

      // 3. 最新日付を取得（例: "YYYY-MM-DD" 形式）
      const meetings = data.meetingRecord || [];
      if (meetings.length === 0) return null;
      // 例: 日付で降順ソート
      meetings.sort((a, b) => (b.date > a.date ? 1 : -1));
      const newestDate = meetings[0].date;

      // 4. 新しいデータがあれば通知
      if (!lastNotifiedDate || newestDate > lastNotifiedDate) {
        // 全体通知（例: トピック "all"）
        await admin.messaging().sendToTopic("all", {
        await admin.messaging().send({
          topic: "all",
          notification: {
            title: "新しい本会議が公開されました",
            body: `日付: ${newestDate}`,
          },
          data: {
            screen: "meeting",
          },
        });
        // Firestoreに最新日付を保存
        await docRef.set({lastDate: newestDate});
      }

      return null;
    });
