-- Keep the submitted original and its permission record when an admin edits a photo.
ALTER TABLE submissions ADD COLUMN edited_photo_key text NOT NULL DEFAULT '';
