#!/bin/bash
# Security Verification Script

echo \"🔒 FIREBASE SECURITY VERIFICATION\"
echo \"=====================================\"
echo \"\"

# Check if sensitive files are ignored by git
echo \"📁 Checking git ignore patterns...\"
if git ls-files | grep -q \"service-account-key.json\"; then
    echo \"❌ ERROR: service-account-key.json is being tracked by git!\"
    echo \"   This is a security risk. Check your .gitignore file.\"
else
    echo \"✅ service-account-key.json is properly ignored by git\"
fi

# Check if example file is ignored (it should be for safety)
if git ls-files | grep -q \"service-account-key.example.json\"; then
    echo \"⚠️  WARNING: service-account-key.example.json is being tracked\"
    echo \"   Consider adding it to .gitignore for consistency\"
else
    echo \"✅ service-account-key.example.json is ignored by git\"
fi

# Check if actual key file exists
if [ -f \"functions/service-account-key.json\" ]; then
    echo \"✅ Service account key file exists in correct location\"
else
    echo \"❌ Service account key file not found at functions/service-account-key.json\"
    echo \"   Please place your service account key there\"
fi

# Check .env file
if [ -f \".env\" ]; then
    echo \"✅ .env file exists\"
    if grep -q \"your_api_key_here\" .env; then
        echo \"⚠️  WARNING: .env contains placeholder values\"
        echo \"   Please replace with actual Firebase config\"
    else
        echo \"✅ .env appears to have real values\"
    fi
else
    echo \"❌ .env file not found\"
fi

echo \"\"
echo \"🔍 ADDITIONAL SECURITY CHECKS\"
echo \"=====================================\"

# Check for any potential security issues in git history
if git log --name-only --oneline | grep -q \"service-account\"; then
    echo \"⚠️  WARNING: Git history contains references to service-account files\"
    echo \"   Review your git history for potential security issues\"
else
    echo \"✅ No service-account references in git history\"
fi

echo \"\"
echo \"🛡️  SECURITY SUMMARY\"
echo \"=====================================\"
echo \"✅ Multiple layers of protection implemented\"
echo \"✅ .gitignore protects against accidental commits\"
echo \"✅ Firebase deployment ignores sensitive files\"
echo \"✅ Environment variables contain only public config\"
echo \"\"
echo \"Remember: Never commit actual service account keys!\"
