; Ferdaboka – Windows-installer (installeres for gjeldende bruker, krever ikke administrator)
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!define APPNAME "Ferdaboka"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define EXE "Ferdaboka.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ferdaboka"

Name "${APPNAME}"
OutFile "..\dist\Ferdaboka-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
BrandingText "Ferdaboka ${VERSION}"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Velkommen til Ferdaboka"
!define MUI_WELCOMEPAGE_TEXT "Ferdaboka er ei kartbok for turene dine, i Ringenes herre-stil.$\r$\n$\r$\nInstallasjonen legger en snarvei på skrivebordet og i Start-menyen.$\r$\n$\r$\nTrykk Neste for å fortsette."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Start Ferdaboka nå"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Norwegian"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_NORWEGIAN} "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=${LANG_NORWEGIAN} "FileDescription" "Ferdaboka installasjon"
VIAddVersionKey /LANG=${LANG_NORWEGIAN} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_NORWEGIAN} "LegalCopyright" "Ferdaboka"

Section "Ferdaboka" SecMain
  ; lukk appen hvis den kjører (ved oppdatering)
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  SetOutPath "$INSTDIR"
  File /r "..\dist\win-unpacked\*.*"
  File "icon.ico"

  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0 SW_SHOWNORMAL "" "Kartbok for turer"
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0 SW_SHOWNORMAL "" "Kartbok for turer"

  WriteUninstaller "$INSTDIR\Avinstaller Ferdaboka.exe"
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Ferdaboka"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Avinstaller Ferdaboka.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

; Ved automatisk oppdatering kjøres installasjonen stille (/S) med --force-run:
; da startes appen igjen når installasjonen er ferdig.
Function .onInstSuccess
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--force-run" $R1
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\${EXE}"'
  ${EndIf}
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  ; Turene og bildene dine (i %APPDATA%\Ferdaboka) blir liggende igjen med vilje.
SectionEnd
