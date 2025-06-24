import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import validator from 'validator';
import mongoosePaginate from 'mongoose-paginate-v2';

const UserSchema = new Schema(
  {
    first_name: {
      type: String,
      required: true,
    },
    last_name: String,
    email: {
      type: String,
      validate: {
        validator: validator.isEmail,
        message: 'EMAIL_IS_NOT_VALID',
      },
      lowercase: true,
      unique: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'SUPERADMIN'],
      default: 'user',
    },
    verification: {
      type: String,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: String,
    },
    city: {
      type: String,
    },
    country: {
      type: String,
    },
    urlTwitter: {
      type: String,
      validate: {
        validator(v) {
          return v === '' ? true : validator.isURL(v);
        },
        message: 'NOT_A_VALID_URL',
      },
      lowercase: true,
    },
    urlGitHub: {
      type: String,
      validate: {
        validator(v) {
          return v === '' ? true : validator.isURL(v);
        },
        message: 'NOT_A_VALID_URL',
      },
      lowercase: true,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    blockExpires: {
      type: Date,
      default: Date.now,
      select: false,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

const hash = (user, salt: string, next: () => void) => {
  bcrypt.hash(user.password, salt, (error, newHash) => {
    if (error) {
      console.log('🚀 Aqui *** -> error:', error);
      return next();
    }
    user.password = newHash;
    return next();
  });
};

const genSalt = (user, SALT_FACTOR: number, next: () => void) => {
  bcrypt.genSalt(SALT_FACTOR, (err, salt) => {
    if (err) {
      console.log('🚀 Aqui *** -> err:', err);
      return next();
    }
    return hash(user, salt, next);
  });
};

UserSchema.pre('save', function (next) {
  const SALT_FACTOR = 5;
  if (!this.isModified('password')) {
    return next();
  }
  return genSalt(this, SALT_FACTOR, next);
});

UserSchema.methods.comparePassword = function (passwordAttempt, cb) {
  bcrypt.compare(passwordAttempt, this.password, (err, isMatch) =>
    err ? cb(err) : cb(null, isMatch),
  );
};

UserSchema.plugin(mongoosePaginate);

export default mongoose.model('Users', UserSchema);
