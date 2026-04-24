# SSVEP 项目从零上手操作手册

这份文档给“刚拿到项目、什么都不知道”的同学使用。  
目标是按步骤完成以下三件事：

1. 跑起 4 频闪刺激页面（FlickerHub）
2. 连上 OpenBCI 并看到实时脑电（brainflow/app.py）
3. 跑在线 SSVEP 识别原型（brainflow/ssvep_online.py）

---

## 1. 你拿到的项目里有什么

仓库主要看两个目录：

- `FlickerHub/`：负责视觉刺激（4 个闪烁目标）
- `brainflow/`：负责 OpenBCI 采集、可视化和在线识别原型

建议路线：先跑刺激，再跑采集，最后跑识别。

---

## 2. 开始前准备

### 2.1 硬件准备

- OpenBCI Cyton 或 Cyton Daisy
- USB Dongle
- 8 通道脑电帽与电极
- 一台显示器（建议先用稳定的 60Hz 或 75Hz）

### 2.2 软件准备

- Python 3.9+（推荐 3.10/3.11）
- Conda（推荐）或 venv
- 浏览器（Chrome/Edge）

### 2.3 串口准备

Windows 常见串口名：`COM4`、`COM5` 等。  
macOS 常见串口名：`/dev/cu.usbserial-*`。

macOS 查看串口：

```bash
ls /dev/cu.*
```

Windows 查看串口（PowerShell）：

```powershell
Get-WmiObject Win32_SerialPort | Select-Object DeviceID, Description
```

---

## 3. 第一步：跑起刺激页面（FlickerHub）

### 3.1 启动本地静态服务器

在仓库根目录执行：

```bash
cd FlickerHub
python3 -m http.server 8000
```

如果你的系统没有 `python3` 命令，可尝试：

```bash
python -m http.server 8000
```

### 3.2 打开页面

浏览器访问：

```text
http://localhost:8000
```

### 3.3 页面上先做这 6 件事

1. 选择 `Profile`（先选 60Hz 或 75Hz 档）
2. 选择 `Frequency Group`（推荐先用 recommended）
3. 选择 `Engine Mode`（先用 frame-locked）
4. 选择 `Output Mode`（binary）
5. 点击 `Fullscreen`
6. 确认 4 个目标都在闪烁，且频率标签显示正常

如果这一步失败，不要继续做 EEG 识别，先把刺激端稳定下来。

---

## 4. 第二步：跑起脑电采集面板（brainflow）

### 4.1 安装依赖

进入目录并安装依赖：

```bash
cd ../brainflow
pip install -r requirements.txt
```

如果你使用 Conda，建议：

```bash
conda activate BCI
pip install -r requirements.txt
```

### 4.2 启动采集服务

把下面的串口替换成你的实际串口。

macOS 示例：

```bash
python app.py --serial-port /dev/cu.usbserial-XXXX --auto-connect
```

Windows 示例：

```powershell
python app.py --serial-port COM4 --auto-connect
```

默认 Web 端口是 `8765`，浏览器打开：

```text
http://127.0.0.1:8765
```

### 4.3 确认采集正常

页面中至少确认：

1. 状态为已连接
2. Raw EEG 有波形
3. Spectrum 在刷新
4. Band Power 有数值

到这一步，说明“设备连接 + 实时数据采集”已打通。

---

## 5. 第三步：跑在线 SSVEP 识别原型

保持脑电帽佩戴好、刺激页面在闪烁，然后在 `brainflow/` 目录开一个新终端运行：

macOS 示例：

```bash
python ssvep_online.py --serial-port /dev/cu.usbserial-XXXX
```

Windows 示例：

```powershell
python ssvep_online.py --serial-port COM4
```

默认目标频率是：`8,12,15,20`。

如果你在刺激端用的是别的频率组，命令要同步改：

```bash
python ssvep_online.py --serial-port /dev/cu.usbserial-XXXX --target-freqs 7.5,10,12,15
```

### 5.1 推荐通道设置

后枕区域优先，先试：

```bash
python ssvep_online.py --serial-port /dev/cu.usbserial-XXXX --channel-preset posterior4
```

可选：

- `posterior2` = 7,8
- `posterior4` = 5,6,7,8
- `posterior6` = 3,4,5,6,7,8

### 5.2 如何判断输出可用

终端会持续打印每个频率分数和当前输出，例如 `output=12.00Hz`。  
你盯住某个频率目标时，该频率应更频繁成为输出，并在多次窗口内保持一致。

---

## 6. 标准实验操作流程（新手照做版）

1. 打开 FlickerHub 全屏，确认 4 个刺激都在闪。
2. 打开 brainflow 面板，确认 EEG 波形正常。
3. 启动 `ssvep_online.py`。
4. 每次只盯一个刺激点，持续 5 到 10 秒。
5. 休息 3 秒，再切下一个刺激点。
6. 记录每次注视时终端输出频率是否正确。
7. 若错误多，先调通道组，再调窗口长度和阈值。

---

## 7. 你最可能遇到的问题和处理顺序

### 7.1 串口打不开

表现：`UNABLE_TO_OPEN_PORT_ERROR` 或连接失败。

处理顺序：

1. 确认串口名是否写对
2. 关闭所有可能占用串口的软件
3. 重新插拔 dongle
4. 检查板子是否上电
5. Daisy 板卡时确认 `--board-id 2`

### 7.2 有连接但没波形

1. 检查电极接触和参考/地
2. 检查脑电帽阻抗
3. 切测试信号模式看是否有变化

### 7.3 识别不稳定

1. 确保刺激频率和 `--target-freqs` 完全一致
2. 优先用后枕通道组（posterior4）
3. 增大窗口长度（如 `--window-sec 2.5` 或 `3.0`）
4. 避免眨眼和头动，注视更稳定
5. 优先在刷新率稳定的显示器上测试

---

## 8. 最小可复现命令清单

### 8.1 刺激端

```bash
cd FlickerHub
python3 -m http.server 8000
```

### 8.2 采集端

```bash
cd ../brainflow
python app.py --serial-port /dev/cu.usbserial-XXXX --auto-connect
```

### 8.3 在线识别端

```bash
cd ../brainflow
python ssvep_online.py --serial-port /dev/cu.usbserial-XXXX --channel-preset posterior4 --target-freqs 8,12,15,20
```

---

## 9. 做到什么算“跑通了”

满足以下 4 条即可认为你已跑通项目：

1. FlickerHub 页面能稳定显示 4 个频闪目标
2. brainflow 页面能稳定显示实时 EEG
3. `ssvep_online.py` 能持续输出频率判定
4. 你盯住某一频率时，输出大多数时间能对应到该频率

---

## 10. 下一步建议

当你完成“跑通”后，建议按这个顺序继续：

1. 录制多轮数据，统计每个频率准确率
2. 固定个人最优通道组和窗口参数
3. 增加“频率 -> 物体 ID -> 下游控制”映射输出
4. 再做机器人交互联调

