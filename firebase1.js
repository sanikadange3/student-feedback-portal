const firebaseConfig = {
  apiKey: "AIzaSyAHA37HynTB2YzBxhrHcVG_kUlMJrrSZJc",
  authDomain: "teacherstudent-86baa.firebaseapp.com",
  projectId: "teacherstudent-86baa",
  storageBucket: "teacherstudent-86baa.firebasestorage.app",
  messagingSenderId: "931949999064",
  appId: "1:931949999064:web:2e7cc3e9ca1c97432578ad"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
