!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"

!ifndef BUILD_UNINSTALLER
Var SmartInstallCheckbox
Var SmartInstallEnabled
Var SmartInstallPreviousPath
Var SmartInstallRememberedPath

!macro cleanPackagedNativeResidue
  ${If} ${FileExists} "$INSTDIR\resources\app.asar.unpacked\node_modules\better-sqlite3\*.*"
    DetailPrint "清理旧版本 better-sqlite3 native 模块"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\better-sqlite3"
  ${EndIf}
!macroend

!macro customInit
  StrCpy $SmartInstallEnabled "0"
  StrCpy $SmartInstallPreviousPath ""
  StrCpy $SmartInstallRememberedPath ""

  ReadRegStr $SmartInstallRememberedPath HKCU "${INSTALL_REGISTRY_KEY}" LastSelectedInstallLocation
  ${If} $SmartInstallRememberedPath == ""
    ReadRegStr $SmartInstallRememberedPath HKLM "${INSTALL_REGISTRY_KEY}" LastSelectedInstallLocation
  ${EndIf}
  ${If} $SmartInstallRememberedPath != ""
  ${AndIf} ${FileExists} "$SmartInstallRememberedPath\*.*"
    StrCpy $INSTDIR $SmartInstallRememberedPath
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  PageEx custom
    PageCallbacks SmartInstallPageCreate SmartInstallPageLeave
    Caption "安装选项"
  PageExEnd
!macroend

!macro customCheckAppRunning
  smart_install_check_running:
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "检测到 ${PRODUCT_NAME} 正在运行。请先关闭应用，然后继续安装。" /SD IDCANCEL IDRETRY smart_install_check_running
      Quit
    ${EndIf}
    !insertmacro cleanPackagedNativeResidue
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" LastSelectedInstallLocation "$INSTDIR"
!macroend

Function SmartInstallPageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 28u "默认情况下，安装程序会使用上一页选择的安装目录。"
  Pop $1

  ${NSD_CreateCheckbox} 0u 38u 300u 18u "自动检测旧版本并选择安装位置"
  Pop $SmartInstallCheckbox
  SendMessage $SmartInstallCheckbox ${BM_SETCHECK} ${BST_UNCHECKED} 0

  ${NSD_CreateLabel} 0u 66u 300u 66u "勾选后：如果检测到已有官方安装且不在 C 盘，将在原位置覆盖安装。如果已有安装位于 C 盘，安装程序会优先选择 D:\${PRODUCT_FILENAME}；如果 D 盘不可用，则继续使用 C 盘。"
  Pop $2

  nsDialogs::Show
FunctionEnd

Function SmartInstallPageLeave
  SendMessage $SmartInstallCheckbox ${BM_GETCHECK} 0 0 $0

  ${If} $0 == ${BST_CHECKED}
    StrCpy $SmartInstallEnabled "1"
    Call ApplySmartInstallLocation
  ${Else}
    StrCpy $SmartInstallEnabled "0"
  ${EndIf}
FunctionEnd

Function ApplySmartInstallLocation
  Push $0
  Push $1
  Push $2

  StrCpy $SmartInstallPreviousPath ""
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation

  ${If} $0 != ""
    StrCpy $SmartInstallPreviousPath $0
  ${ElseIf} $1 != ""
    StrCpy $SmartInstallPreviousPath $1
  ${EndIf}

  ${If} $SmartInstallPreviousPath != ""
    StrCpy $2 $SmartInstallPreviousPath 3
    ${If} $2 != "C:\"
    ${AndIf} $2 != "c:\"
      StrCpy $INSTDIR $SmartInstallPreviousPath
      Goto done
    ${EndIf}
  ${EndIf}

  ${If} ${FileExists} "D:\*.*"
    StrCpy $INSTDIR "D:\${PRODUCT_FILENAME}"
  ${ElseIf} $SmartInstallPreviousPath != ""
    StrCpy $INSTDIR $SmartInstallPreviousPath
  ${Else}
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_FILENAME}"
  ${EndIf}

  done:
    Pop $2
    Pop $1
    Pop $0
FunctionEnd
!endif
