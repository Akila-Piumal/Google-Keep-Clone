const admin = require('firebase-admin');

const initializeFirebase = () => {
    try {
        // Check if Firebase is already initialized
        if (admin.apps.length === 0) {
            if (process.env.FIREBASE_PRIVATE_KEY) {
                const serviceAccount = {
                    type: "service_account",
                    project_id: process.env.FIREBASE_PROJECT_ID,
                    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    client_email: process.env.FIREBASE_CLIENT_EMAIL,
                    client_id: process.env.FIREBASE_CLIENT_ID,
                    auth_uri: process.env.FIREBASE_AUTH_URI,
                    token_uri: process.env.FIREBASE_TOKEN_URI,
                    auth_provider_x509_cert_url: `https://www.googleapis.com/oauth2/v1/certs`,
                    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
                };

                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
                });
            }

            console.log('Firebase Admin SDK initialized successfully');
        }

    }catch(error){
        console.error('Firebase initialization error:', error.message);
        throw error;
    }
};

// Initialize Firebase
initializeFirebase();

// Export Firebase services
const auth = admin.auth();
const firestore = admin.firestore();
const storage = admin.storage();

// Helper functions
const verifyIdToken = async (idToken) => {
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Token verification error:', error.message);
      throw new Error('Invalid token');
    }
};

const uploadFileToStorage = async (file, fileName, folderName = 'uploads') => {
    try {
      const bucket = storage.bucket();
      const fileUpload = bucket.file(`${folderName}/${fileName}`);
      
      const stream = fileUpload.createWriteStream({
        metadata: {
          contentType: file.mimetype,
        },
      });
  
      return new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          console.error('Storage upload error:', error);
          reject(error);
        });
  
        stream.on('finish', async () => {
          try {
            // Make the file public
            await fileUpload.makePublic();
            
            // Get public URL
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`;
            
            resolve(publicUrl);
          } catch (error) {
            reject(error);
          }
        });
  
        stream.end(file.buffer);
      });
    } catch (error) {
      console.error('File upload error:', error.message);
      throw error;
    }
};

const deleteFileFromStorage = async (fileName, folderName = 'uploads') => {
    try {
      const bucket = storage.bucket();
      const file = bucket.file(`${folderName}/${fileName}`);
      
      await file.delete();
      console.log(`File ${fileName} deleted successfully`);
    } catch (error) {
      console.error('File deletion error:', error.message);
      throw error;
    }
};

module.exports = {
    auth,
    firestore,
    storage,
    verifyIdToken,
    uploadFileToStorage,
    deleteFileFromStorage
};