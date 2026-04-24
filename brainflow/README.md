# BrainFlow EEG Dashboard

一个基于 `BrainFlow` 的本地 EEG 可视化小工具，面向 `OpenBCI Cyton / Cyton Daisy`。  
它会启动一个本地 Web 服务，在浏览器里实时显示：

- 原始 EEG 波形
- 0-60 Hz 频谱
- `delta / theta / alpha / beta / gamma` 频带功率
- 每个通道的均值、标准差、最小值、最大值

当前项目默认按 Windows + Conda 环境使用，和你现有的 `BCI` 环境兼容。

## 项目现状

当前仓库已经可以作为一个可直接运行的本地 EEG 监看面板使用，适合做：

- Cyton / Cyton Daisy 连通性验证
- 串口、板型、采样是否正常的快速确认
- 实时观察 EEG 原始波形和频谱变化
- 使用板载测试信号做基础校正/自检

目前项目的整体状态是：

- 后端已实现：设备连接、断开、数据轮询、频谱计算、频带功率统计、通道统计、基础校正命令下发
- 前端已实现：单屏仪表盘布局、设备状态显示、连接控制、校正按钮、实时图表和表格
- 启动体验已处理：默认使用 `8765` 端口，启动脚本实时输出日志，端口占用/权限错误会给出更明确提示
- 文档已覆盖：安装、启动、端口问题、串口问题、误装依赖问题

当前还没有实现的能力包括：

- OpenBCI GUI 里的逐通道阻抗检测 `Check Channel / Check All Channels`
- 每通道独立硬件配置，例如增益、输入类型、偏置等
- 数据录制导出
- 滤波器控制面板
- 在线分类或 SSVEP 检测结果显示

补充：

- 现在已经新增一个独立的命令行原型脚本 `ssvep_online.py`
- 它会直接从 BrainFlow 实时取最近窗口数据，做基础频域带通/工频抑制，再用 CCA 对目标频率打分
- 默认通道组是后部 `5,6,7,8`，也支持切到 `7,8`、`3,4,5,6,7,8` 或自定义通道

## 项目结构

```text
brainflow/
├─ app.py                # 本地 HTTP 服务 + BrainFlow 数据采集
├─ run_dashboard.ps1     # Windows PowerShell 启动脚本
├─ requirements.txt      # Python 依赖
├─ ssvep_online.py       # 轻量 CCA 在线解码原型
├─ ssvep_classifier.py   # 5 类采集 + 自动切片 + FFT + MLP + 在线分类
├─ test.ipynb            # 你的采集测试 notebook
└─ static/
   ├─ index.html         # Web 页面
   ├─ app.js             # 前端逻辑
   └─ styles.css         # 页面样式
```

## 环境要求

- Windows
- Conda
- 一个可用的 Python 环境，建议环境名为 `BCI`
- OpenBCI Cyton 或 Cyton Daisy
- USB Dongle / 串口驱动正常

## 安装依赖

如果你已经有 `BCI` 环境，可以直接在该环境中安装依赖：

```powershell
conda activate BCI
pip install -r requirements.txt
```

如果你更习惯不手动激活环境，也可以继续用后面的 `conda run -n BCI` 启动方式。

## 如何确认串口

先确认 Cyton 对应的是哪个串口。Windows 下可以运行：

```powershell
Get-WmiObject Win32_SerialPort | Select-Object DeviceID, Description
```

示例输出：

```text
DeviceID Description
-------- -----------
COM4     USB 串行设备
```

如果设备显示为 `COM4`，那启动时就应使用 `COM4`。

也可以在“设备管理器”中查看：

1. 打开“设备管理器”
2. 展开“端口 (COM 和 LPT)”
3. 插拔 OpenBCI dongle
4. 看新增或变化的 `COM` 口

## 启动方式

### 方式 1：使用 PowerShell 启动脚本

默认端口 `8765`，默认串口 `COM4`：

```powershell
.\run_dashboard.ps1
```

指定串口并自动连接：

```powershell
.\run_dashboard.ps1 -SerialPort COM4 -AutoConnect
```

如果你是 Daisy 板卡，可以传入 `BoardId 2`：

```powershell
.\run_dashboard.ps1 -SerialPort COM4 -BoardId 2 -AutoConnect
```

### 方式 2：直接运行 Python

```powershell
conda run -n BCI python app.py --serial-port COM4 --auto-connect
```

如果想改网页服务端口：

```powershell
conda run -n BCI python app.py --serial-port COM4 --port 8765 --auto-connect
```

## 打开网页

启动成功后，在浏览器里访问：

```text
http://127.0.0.1:8765
```

如果你改了端口，就把 `8765` 替换成对应端口。

之所以默认不用 `8000`，是因为 Windows 上这个端口有时会被系统策略、代理或其他软件占用/保留，导致 `WinError 10013`。

## 页面功能

页面提供以下能力：

- 串口输入框：例如 `COM4`
- `Board ID` 选择：
  - `0` = `Cyton`
  - `2` = `Cyton Daisy`
- 窗口秒数设置：控制页面每次显示最近多少秒数据
- `连接` / `断开` 按钮
- 校正按钮：
  - `正常`：恢复默认采集配置
  - `接地`：切到板载接地测试输入
  - `慢方波`：切到慢速内部测试信号
  - `快方波`：切到快速内部测试信号

当前页面布局已经调整为桌面端单屏优先：

- 顶部区域：标题、设备状态、连接参数、校正按钮
- 左侧：`Raw EEG` 与 `Spectrum` 合并大图
- 右侧：`Band Power` 与 `Channel Stats`

这样在常见笔记本屏幕上通常不需要整页滚动；如果屏幕较窄，会自动回退成响应式布局。

连接成功后可以看到：

- `Raw EEG`：所有 EEG 通道叠加后的最近窗口原始波形
- `Band Power`：五个经典频段在各通道上的功率热力概览
- `Spectrum`：所有通道叠加后的 0-60 Hz 频谱
- `Channel Stats`：统计值表格

校正模式适合做：

- 检查各通道是否都能看到一致的测试信号
- 排查串口连通后但电极接触不稳定的情况
- 快速区分“硬件/输入链路问题”与“真实脑电变化”

需要注意：

- 这里的“校正”目前指的是板载测试信号切换，不等同于 OpenBCI GUI 的阻抗检测
- 如果你要做 `Check Channel` 这类电极接触质量检查，目前仓库里还没有实现

## 常用命令

查看帮助：

```powershell
conda run -n BCI python app.py --help
```

启动最小在线 SSVEP 解码（CCA 原型）：

```powershell
conda run -n BCI python ssvep_online.py --serial-port COM4
```

只用更靠后的两个通道：

```powershell
conda run -n BCI python ssvep_online.py --serial-port COM4 --channel-preset posterior2
```

使用自定义通道组：

```powershell
conda run -n BCI python ssvep_online.py --serial-port COM4 --channels 5,6,7,8
```

如果你的 FlickerHub 当前不是 `8,12,15,20`，也可以改候选频率：

```powershell
conda run -n BCI python ssvep_online.py --serial-port COM4 --target-freqs 7.5,10,12,15
```

语法检查：

```powershell
conda run -n BCI python -m py_compile app.py
```

## 新增：5 类采集 + FFT + 神经网络持续分类

这里新增了 `ssvep_classifier.py`，流程是：

- 通过 BrainFlow 直接采 EEG
- 按 `4 个频率 + 无频闪` 共 5 类采样
- 采样后自动切分成滑动窗口样本
- 自动提取 FFT 功率特征
- 用纯 `numpy` MLP 做 5 类训练
- 在线阶段按 N 秒窗口持续分类

### 推荐采集协议

- 类别：`8Hz / 12Hz / 15Hz / 20Hz / none`
- 每类重复：`10` 次（可增加）
- 单次 trial：`6s`
- 准备时间：`2s`
- trial 间休息：`2s`
- 自动切片窗口：`2s`
- 切片步长：`0.5s`

说明：

- `none` 代表无频闪/静息条件
- 每个 trial 开始前脚本会提示，按回车开始
- trial 完成后会自动切片用于后续 FFT 与训练

### 一条命令跑完整流程（采集→训练→在线）

```powershell
conda run -n BCI python ssvep_classifier.py `
  --mode all `
  --serial-port COM4 `
  --board-id 0 `
  --channel-preset posterior4 `
  --target-freqs 8,12,15,20 `
  --repeats 10 `
  --prepare-sec 2 `
  --trial-sec 6 `
  --rest-sec 2 `
  --window-sec 2 `
  --step-sec 0.5 `
  --predict-every-sec 0.5
```

### 分步执行

仅采集：

```powershell
conda run -n BCI python ssvep_classifier.py --mode collect --serial-port COM4
```

仅训练：

```powershell
conda run -n BCI python ssvep_classifier.py --mode train
```

仅在线分类：

```powershell
conda run -n BCI python ssvep_classifier.py --mode online --serial-port COM4 --window-sec 2
```

### 输出文件

默认产物：

- `artifacts/ssvep_dataset.npz`
  - `x_windows`：自动切片后的时域窗口，形状 `(num_windows, channels, window_samples)`
  - `y`：标签 id
  - `labels`：类别名（5 类）
  - `sampling_rate / channel_numbers / window_sec / step_sec` 等元数据
- `artifacts/ssvep_mlp_model.npz`
  - MLP 参数（权重/偏置）
  - 标准化参数（均值/方差）
  - 训练用频段与标签

### 在线输出解释

```text
[14:02:31] pred=12Hz confidence=0.736 | 8Hz=0.101 | 12Hz=0.736 | 15Hz=0.082 | 20Hz=0.029 | none=0.052
```

- `pred`：当前窗口预测类别
- `confidence`：当前最高类别概率
- 后续字段：每个类别的概率分布

默认每 `0.5s` 输出一次，使用最近 `window-sec` 秒 EEG 做一次分类。

### 关键参数说明

- `--window-sec`：N 秒分类窗口长度
- `--step-sec`：采集阶段自动切片步长
- `--predict-every-sec`：在线预测输出间隔
- `--channel-preset`：
  - `posterior2` = `7,8`
  - `posterior4` = `5,6,7,8`
  - `posterior6` = `3,4,5,6,7,8`
  - `all` = 所有 EEG 通道
- `--channels`：自定义通道（优先级高于 preset），例如 `5,6,7,8`
- `--target-freqs`：4 个频率，脚本会自动追加 `none` 作为第 5 类

## 常见问题

### 1. `UNABLE_TO_OPEN_PORT_ERROR`

这个错误通常表示串口存在，但当前程序无法打开。优先排查：

- 串口号写错了
- 串口被别的程序占用
- Cyton 没上电
- 板子和 dongle 没配对好
- 板型选错了，Daisy 却用了普通 Cyton 的 `Board ID`

建议按这个顺序检查：

1. 运行 `Get-WmiObject Win32_SerialPort | Select-Object DeviceID, Description`
2. 确认代码和页面里填写的是正确的 `COM` 口
3. 关闭 OpenBCI GUI、Arduino 串口监视器、串口调试助手等可能占用串口的软件
4. 重新插拔 dongle
5. 确认 Cyton 电池和电源状态正常
6. 如果是 Daisy，使用 `Board ID = 2`

### 2. 页面打开了，但没有数据

常见原因：

- 设备还没连接
- 连接失败但页面没刷新
- 采集窗口太短，刚启动时样本数还不够

可以尝试：

- 点击一次“断开”，再重新“连接”
- 把窗口秒数调大到 `6` 或 `8`
- 观察页面顶部状态卡片是否显示 `Streaming`

### 3. `python` 里找不到 `brainflow`

说明当前终端用的不是你的 `BCI` 环境。优先使用：

```powershell
conda run -n BCI python app.py --serial-port COM4 --auto-connect
```

或者先手动：

```powershell
conda activate BCI
```

再执行命令。

### 4. `PermissionError: [WinError 10013]` 绑定网页端口失败

这说明失败发生在本地网页服务启动阶段，不是串口连接阶段。常见原因：

- 端口已被其他程序占用
- Windows 把该端口保留给了别的服务
- 某些安全软件拦截了该监听行为

优先尝试：

```powershell
conda run -n BCI python app.py --serial-port COM4 --port 8765 --auto-connect
```

或者：

```powershell
.\run_dashboard.ps1 -SerialPort COM4 -Port 8765 -AutoConnect
```

如果 `8765` 也不行，再换一个高位端口，例如 `8899` 或 `9001`。

### 5. 误装了 `serial`

项目依赖是 `pyserial`，不是 `serial`。如果你刚执行过：

```powershell
pip install serial
```

建议清理并重新安装：

```powershell
pip uninstall -y serial
pip install -r requirements.txt
```

## 当前实现说明

目前这个项目是一个轻量本地监控面板，技术实现上有这些特点：

- 不依赖 Flask、FastAPI 之类额外 Web 框架
- 后端直接基于 Python 标准库 `http.server`
- 前端使用原生 HTML / CSS / JavaScript
- 频谱通过 `numpy.fft` 计算
- 频带功率是按频段均值做的快速概览
- 通过 BrainFlow `config_board` 下发基础校正命令
- 使用浏览器轮询 `/api/stream` 获取实时数据

这意味着它非常适合做：

- 设备连通性确认
- 实时监看 EEG 波形
- 采集前调试
- 小型实验的在线观察

同时也意味着它当前更偏“调试仪表盘”，还不是完整的 OpenBCI GUI 替代品。

## 下一步可扩展方向

如果你想继续做成更完整的 BCI 工具，下一步很适合加：

- 带通滤波和工频陷波
- 通道开关和增益显示
- 数据录制到 CSV / EDF
- SSVEP 特征频率高亮
- 实时分类结果显示
- WebSocket 推流，降低轮询延迟

## License

如果你后面准备开源，可以在这里补上许可证信息，比如 `MIT`。
