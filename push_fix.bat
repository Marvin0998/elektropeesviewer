@echo off
cd /d "C:\Users\wow-m\Desktop\viewer360"

git config core.autocrlf false

git update-index --assume-unchanged app/components/AnnotationLayer.js
git update-index --no-assume-unchanged app/components/AnnotationLayer.js

git update-index --assume-unchanged "app/share/[token]/viewer/[photoId]/page.js"
git update-index --no-assume-unchanged "app/share/[token]/viewer/[photoId]/page.js"

git update-index --assume-unchanged "app/viewer/[id]/page.js"
git update-index --no-assume-unchanged "app/viewer/[id]/page.js"

git add --force app/components/AnnotationLayer.js
git add --force "app/share/[token]/viewer/[photoId]/page.js"
git add --force "app/viewer/[id]/page.js"

git status

git commit -m "Fix labels toggle with CSS display"
git push

echo FERTIG!
pause
