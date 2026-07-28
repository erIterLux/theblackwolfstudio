import {
  Camera,
  CheckCircle2,
  ImageUp,
  LoaderCircle,
  Mail,
  Save,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMyProfile,
  updateMyProfile,
  uploadProfileImage,
  validateProfileImage,
} from '../services/profiles';

const EMPTY_PROFILE = {
  displayName: '',
  phone: '',
  pronouns: '',
  bio: '',
  photoURL: '',
  profileImagePath: '',
};

export default function ProfilePage() {
  const { pathname } = useLocation();
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewURL, setPreviewURL] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isInstructor = pathname.startsWith('/instructor');

  useEffect(() => {
    let active = true;
    getMyProfile()
      .then((result) => {
        if (!active) return;
        setProfile({ ...EMPTY_PROFILE, ...result });
      })
      .catch((nextError) => {
        if (active) setError(nextError?.message || 'Your profile could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
  }, [previewURL]);

  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    try {
      validateProfileImage(file);
      setSelectedFile(file);
      setPreviewURL(URL.createObjectURL(file));
    } catch (nextError) {
      event.target.value = '';
      setSelectedFile(null);
      setError(nextError.message);
    }
  };

  const updateField = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage('');
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!profile.displayName.trim()) {
      setError('Enter your full name.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    setProgress(0);
    try {
      let image = {
        photoURL: profile.photoURL,
        profileImagePath: profile.profileImagePath,
      };
      if (selectedFile) {
        image = await uploadProfileImage({
          uid: user.uid,
          file: selectedFile,
          onProgress: setProgress,
        });
      }

      const result = await updateMyProfile({
        displayName: profile.displayName,
        phone: profile.phone,
        pronouns: profile.pronouns,
        bio: profile.bio,
        ...image,
      });
      setProfile((current) => ({ ...current, ...result }));
      setSelectedFile(null);
      setPreviewURL('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshUser();
      setMessage('Your profile has been updated.');
    } catch (nextError) {
      setError(nextError?.message || 'Your profile could not be saved.');
    } finally {
      setSaving(false);
      setProgress(0);
    }
  };

  const visiblePhoto = previewURL || profile.photoURL || user?.photoURL;
  const visibleName = profile.displayName || user?.displayName || user?.email || 'Studio account';

  return (
    <section className="profile-page">
      <div className="container">
        <header className="profile-page__heading">
          <div>
            <p className="eyebrow">{isInstructor ? 'Instructor account' : 'Member account'}</p>
            <h1>Your profile</h1>
            <p>Keep your contact information and profile photo current.</p>
          </div>
        </header>

        {loading ? (
          <div className="profile-loading" role="status">
            <LoaderCircle className="spin" size={26} aria-hidden="true" />
            Loading your profile…
          </div>
        ) : (
          <form className="profile-editor" onSubmit={saveProfile}>
            <aside className="profile-photo-card">
              <div className="profile-photo-card__preview">
                {visiblePhoto ? (
                  <img src={visiblePhoto} alt={`${visibleName} profile`} />
                ) : (
                  <UserRound size={58} aria-hidden="true" />
                )}
                <span aria-hidden="true"><Camera size={18} /></span>
              </div>
              <div>
                <h2>Profile photo</h2>
                <p>Use a clear, recent image so studio members can recognize you.</p>
              </div>
              <input
                ref={fileInputRef}
                className="sr-only"
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={chooseImage}
              />
              <label className="button button--dark-ghost" htmlFor="profile-photo">
                <ImageUp size={17} aria-hidden="true" />
                {selectedFile ? 'Choose a different image' : 'Upload an image'}
              </label>
              <small>JPG, PNG, or WebP. Maximum 5 MB.</small>
              {selectedFile && <small className="profile-photo-card__selection">{selectedFile.name}</small>}
              {saving && selectedFile && (
                <div className="profile-upload-progress" aria-label={`Image upload ${progress}% complete`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              )}
            </aside>

            <div className="profile-details-card">
              <div className="profile-details-card__heading">
                <div>
                  <p className="eyebrow">Personal details</p>
                  <h2>Account information</h2>
                </div>
                <UserRound size={24} aria-hidden="true" />
              </div>

              <div className="profile-form-grid">
                <label>
                  Full name
                  <input
                    required
                    maxLength={160}
                    autoComplete="name"
                    value={profile.displayName}
                    onChange={(event) => updateField('displayName', event.target.value)}
                  />
                </label>
                <label>
                  Pronouns <span className="optional-label">optional</span>
                  <input
                    maxLength={60}
                    value={profile.pronouns}
                    placeholder="Example: she/her"
                    onChange={(event) => updateField('pronouns', event.target.value)}
                  />
                </label>
                <label>
                  Phone <span className="optional-label">optional</span>
                  <input
                    type="tel"
                    maxLength={40}
                    autoComplete="tel"
                    value={profile.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                  />
                </label>
                <label>
                  Email
                  <span className="profile-readonly-field">
                    <Mail size={16} aria-hidden="true" />
                    {profile.email || user?.email}
                  </span>
                  <small>Email changes require account verification. Contact the studio for help.</small>
                </label>
              </div>

              <label className="profile-bio-field">
                About you <span className="optional-label">optional</span>
                <textarea
                  maxLength={600}
                  rows={6}
                  value={profile.bio}
                  placeholder={isInstructor
                    ? 'Share your training background, teaching focus, or a short introduction.'
                    : 'Share a little about your training interests or goals.'}
                  onChange={(event) => updateField('bio', event.target.value)}
                />
                <small>{profile.bio.length}/600 characters</small>
              </label>

              {error && <p className="form-status form-status--error" role="alert">{error}</p>}
              {message && (
                <p className="form-status profile-save-success" role="status">
                  <CheckCircle2 size={17} aria-hidden="true" />
                  {message}
                </p>
              )}

              <div className="profile-save-bar">
                <p>Your changes update your account across the studio workspace.</p>
                <button className="button" type="submit" disabled={saving}>
                  {saving
                    ? <LoaderCircle className="spin" size={17} aria-hidden="true" />
                    : <Save size={17} aria-hidden="true" />}
                  {saving
                    ? selectedFile && progress < 100 ? `Uploading ${progress}%…` : 'Saving…'
                    : 'Save profile'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
