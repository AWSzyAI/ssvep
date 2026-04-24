# SSVEP 项目总览

这个仓库目前不是一个“开箱即用的一键 BCI 系统”，而是三条路线放在一起的工作区：

1. `FlickerHub/`
   负责 SSVEP 视觉刺激呈现，也就是在屏幕上稳定地产生 4 个不同频率的闪烁目标。
2. `brainflow/`
   负责通过 BrainFlow 连接 OpenBCI Cyton / Cyton Daisy，实时查看 EEG 波形、频谱、阻抗估计，并承载当前的 Python 在线解码原型。
3. `bci_ssvep_openvibe_ros/`
   一个更早期的 OpenViBE + ROS 方案，偏论文/实验室流程，不适合现在直接拿来当 BrainFlow 项目的主入口。

如果你现在的目标是：

- 先把刺激跑起来
- 先把 OpenBCI 数据采上来
- 然后做 SSVEP 识别

推荐路线是：

`FlickerHub` 负责刺激 -> `brainflow` 负责采集 -> 你自己的 Python 识别脚本负责分类

而不是直接从 `bci_ssvep_openvibe_ros` 开始。

## 当前状态

### 已完成

#### 1. FlickerHub：刺激呈现

已经实现：

- 4 个独立刺激目标
- 多个显示器档案
  - `60 Hz`
  - `75 Hz`
  - `165 Hz`
  - `Quest 120 Hz`
- 两种刺激引擎
  - `frame-locked`
  - `continuous-phase`
- 两种输出模式
  - 黑白二值闪烁
  - 灰度亮度调制
- 浏览器侧运行时监控
  - 估计刷新率
  - 当前档案
  - 当前频率组
  - 当前刺激状态
- 全屏显示
- 对外浏览器 API 预留，后续可接 EEG / ROS / 外部逻辑

这部分已经足够做“刺激端是否稳定”的验证。

#### 2. brainflow：采集、可视化与阻抗原型

已经实现：

- 连接 OpenBCI Cyton / Cyton Daisy
- 串口采集
- 实时 EEG 波形显示
- `0-60 Hz` 频谱显示
- `delta/theta/alpha/beta/gamma` 频带功率统计
- 每通道均值、标准差、最小值、最大值
- 板载测试信号切换
  - 正常输入
  - 接地
  - 慢方波
  - 快方波
- 单通道阻抗估计
- 一键轮测全部通道阻抗
- 页面内直接挂官方文档链接

这部分已经可以用来做“采集端 + 接触质量”的验证。

#### 3. 最小在线识别原型

已经新增：

- `brainflow/ssvep_online.py`

当前这个脚本可以：

- 连 OpenBCI
- 读取最近窗口 EEG
- 做基础带通与工频抑制
- 跑多频率 CCA
- 输出每个候选频率分数
- 输出平滑后的当前预测
- 切换不同通道组
  - `posterior2 = 7,8`
  - `posterior4 = 5,6,7,8`
  - `posterior6 = 3,4,5,6,7,8`

它是一个“在线解码原型”，不是最终版系统，但已经能承载你后续讨论和实验。

#### 4. test.ipynb：最小采集验证

Notebook 已经验证了：

- BrainFlow 可以连接 Cyton
- 可以采 5 秒数据
- 可以取出 EEG 通道矩阵

这说明“设备连通 + 取数”这一步已经打通。

### 还没完成

目前还没有真正完成的是：

- 稳定可用的在线 SSVEP 分类闭环
- FlickerHub 与解码器的正式联动
- 结构化实验流程与 marker 记录
- 数据录制与离线评估脚本
- 在线决策层的正式阈值 / 投票逻辑
- 离线模型训练、参数搜索与性能报告
- 面向 ROS 或机器人控制的下游接口

也就是说，这个仓库现在更像：

- 刺激端已经有了
- 采集端已经有了
- 初步在线解码原型已经有了
- 但完整实验闭环和正式工程化还需要继续搭

## 仓库怎么理解

### `FlickerHub/`

这是前端刺激器。

它解决的问题是：如何在不同刷新率屏幕上尽量稳定地产生 4 个 SSVEP 刺激目标。

它不负责 EEG 采集，也不负责分类。

### `brainflow/`

这是当前主线里的本地采集与在线原型目录。

它解决的问题包括：

- 如何从 OpenBCI 读到脑电
- 如何实时看波形和频谱
- 如何估计电极接触阻抗
- 如何先做一个最小在线 CCA 解码原型

它是你现在最应该继续扩展的目录。

### `bci_ssvep_openvibe_ros/`

这是老的 OpenViBE + ROS 工作流。

它的典型流程是：

1. `ssvep-configuration.mxs`
2. `training-acquisition.mxs`
3. `CSP-training-harm.mxs`
4. `classifier-training-harm.mxs`
5. `online-4-stim.mxs`

这个目录更适合：

- 参考以前的实验流程
- 学习旧系统如何组织训练、在线识别和输出控制
- 理解哪些逻辑值得迁移到现在的 BrainFlow 路线

它不适合你现在直接拿来跑，因为：

- 依赖 OpenViBE
- 偏 Ubuntu 16.04 + ROS Kinetic 老环境
- 默认假设 Acquisition Server + OpenViBE 是系统中枢
- 与你现在的 Windows + BrainFlow + 前端刺激工作流不是同一条线

所以如果你现在说“`bci_ssvep_openvibe_ros` 不会用”，这是很正常的。

它更像“旧系统逻辑参考库”，不是“现在的主入口”。

## 目前推荐的主线架构

如果按现实可落地性来排，当前最合理的方向是：

```text
FlickerHub 负责刺激
BrainFlow 负责采集
Python 负责在线解码 / 记录 / 评估
必要时再把结果送给 ROS
```

对应关系可以理解成：

- `FlickerHub`：刺激与实验界面层
- `brainflow/app.py`：采集与监看层
- `brainflow/ssvep_online.py`：在线识别原型层
- 未来的 `ssvep_record.py / ssvep_evaluate.py`：实验与评估层

## 运行建议

### 路线 A：先确认刺激能正常出

进入 `FlickerHub/`：

```bash
cd FlickerHub
python3 -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

建议先做这几步：

1. 选择一个显示器档案
2. 选择频率组
3. 切到全屏
4. 确认四个刺激目标都在稳定闪烁
5. 看右侧监控面板里的估计刷新率和当前频率

如果你当前主要在外接 `60 Hz` 屏幕上测，优先用：

- `60 Hz Baseline`
- `frame-locked`

如果你当前主要在 `165 Hz` 内屏上测，优先用：

- `165 Hz High Refresh`
- `continuous-phase`

### 路线 B：再确认 OpenBCI 能稳定采数据

进入 `brainflow/`：

```powershell
cd brainflow
conda activate BCI
pip install -r requirements.txt

Get-WmiObject Win32_SerialPort | Select-Object DeviceID, Description

python app.py --serial-port COM4 --auto-connect
```

浏览器打开：

```text
http://127.0.0.1:8765
```

先完成这几个检查：

1. 能连上板子
2. 原始 EEG 有波形
3. 频谱能正常更新
4. 切换测试信号时频谱会变化
5. 阻抗面板能正常给出估计结果

如果这里还没稳定，不建议直接做 SSVEP 分类。

### 路线 C：最后再做 SSVEP 在线解码

当前最小在线命令可以直接跑：

```powershell
cd brainflow
conda activate BCI
python ssvep_online.py --serial-port COM4
```

只用更靠后的两个通道：

```powershell
python ssvep_online.py --serial-port COM4 --channel-preset posterior2
```

使用自定义通道组：

```powershell
python ssvep_online.py --serial-port COM4 --channels 5,6,7,8
```

如果 FlickerHub 当前频率不是 `8,12,15,20`，也可以改候选频率：

```powershell
python ssvep_online.py --serial-port COM4 --target-freqs 7.5,10,12,15
```

## 一个很重要的环境结论

### Windows 是当前采集主环境

目前已经确认：

- 在 Windows 下，BrainFlow 直接使用 `COM4` 是当前主方案
- 在 Linux / WSL 里直接拿 `COM4` 跑采集并不合适

原因很简单：

- `COM4` 是 Windows 串口名，不是 Linux 串口设备名
- WSL2 对实时串口 / USB 透传不是当前这套项目的低成本路径

所以当前建议是：

- 采集主流程放在 Windows
- WSL 主要用于读代码、写脚本、做文档整理
- 如果将来要在 WSL 跑算法，更推荐“Windows 采集 -> 网络转发给 WSL”，而不是让 WSL 直接打开 OpenBCI 串口

### 一个串口只能有一个主进程占用

还需要特别注意：

- `app.py` 和 `ssvep_online.py` 不要同时都直连同一个 `COM4`
- OpenBCI GUI、Arduino 串口监视器、其它 Python 进程也不要同时占用

如果看到这类问题：

- `UNABLE_TO_OPEN_PORT_ERROR`
- `BOARD_NOT_READY_ERROR`
- `Wrong end byte`

优先怀疑：

- 串口被别的程序占用
- 连接状态已经乱了还在继续发命令
- 板子 / dongle 当时没有完成正常握手

## SSVEP 识别怎么理解

### 1. 基本原理

SSVEP（稳态视觉诱发电位）的核心思想很简单：

- 屏幕上有多个不同频率的闪烁目标，比如 `8 Hz / 12 Hz / 15 Hz / 20 Hz`
- 人盯住其中一个目标时，视觉皮层 EEG 里会出现对应频率的能量增强
- 所以只要比较 EEG 里“哪一个刺激频率最像”，就能推测用户正在看哪个目标

常用电极通常优先看枕叶区域，例如：

- `O1`
- `Oz`
- `O2`
- 以及附近通道

如果现在还没有严格按 10-20 系统放电极，也至少尽量保证后部视觉皮层区域接触稳定。

### 2. 常见算法

#### 方法一：频谱峰值法

最简单的做法是：

1. 取一个时间窗内的 EEG
2. 做 FFT / PSD
3. 看目标频率附近哪一个峰值最大

优点：

- 最容易理解
- 最适合调试和可视化

缺点：

- 对噪声敏感
- 通常不如 CCA 稳

它很适合先做“有没有 SSVEP 响应”的快速验证。

#### 方法二：CCA

CCA（Canonical Correlation Analysis，典型相关分析）是经典 SSVEP 方法。

做法是：

1. 取一个 EEG 时间窗，形状通常是 `通道数 x 采样点数`
2. 对每个候选频率 `f`，构造参考信号：
   - `sin(2πft)`
   - `cos(2πft)`
   - `sin(2π2ft)`
   - `cos(2π2ft)`
   - 可以继续加谐波
3. 计算 EEG 与参考信号集合之间的典型相关系数
4. 哪个频率的相关系数最大，就判为当前注视目标

优点：

- 不一定需要大量训练数据
- 对多通道 SSVEP 很常用
- 很适合当前阶段先搭原型

#### 方法三：FBCCA

FBCCA（Filter Bank CCA）是在 CCA 之前加多组滤波器组，再把各频带结果加权融合。

优点：

- 通常比普通 CCA 更稳

代价：

- 实现更复杂

如果现在只是先跑通，建议顺序是：

1. 先用频谱峰值法看是否有响应
2. 再上 CCA 做在线分类
3. 以后再考虑 FBCCA

## 用 BrainFlow 做 SSVEP 的推荐流程

需要先说明一件很重要的事：

BrainFlow 本身主要负责“采集、基础滤波、基础信号处理接口”，它不是一个现成的 SSVEP 分类框架。

也就是说：

- BrainFlow 负责把 EEG 数据拿出来
- SSVEP 分类算法需要你自己在 Python 里实现

这是正常用法，不是你用错了。

### 1. 数据流

一个最实用的数据流如下：

1. 用 BrainFlow 连 OpenBCI
2. 连续采样
3. 每 `0.25 ~ 0.5` 秒滑动一次窗口
4. 每次取最近 `1 ~ 4` 秒数据
5. 对选定 EEG 通道做预处理
6. 跑 CCA
7. 得到 4 个候选频率分数
8. 输出分数最高的目标

### 2. 推荐预处理

对 SSVEP 来说，常见预处理包括：

- 去直流分量
- 带通滤波，例如 `6-40 Hz`
- 工频陷波，例如 `50 Hz`
- 只选后部视觉相关通道

如果采样率是 Cyton 常见的 `250 Hz`，这个范围通常够用。

### 3. 推荐窗口长度

经验上：

- `1 秒`：响应快，但不一定稳
- `2 秒`：常见折中
- `3-4 秒`：更稳，但延迟更大

建议先从：

- 窗口长度 `2 秒`
- 每 `0.5 秒` 更新一次结果

开始做。

## 关于电极通道的现实建议

目前根据已有电极分布讨论，最值得优先尝试的是后部通道，而不是一开始把全部通道一起喂进去。

建议从这些组合依次试：

1. `7,8`
2. `5,6,7,8`
3. `3,4,5,6,7,8`

经验上：

- `7,8` 更像核心后部通道
- `5,6` 是后侧补充
- `3,4` 可以作为中后部备选
- 太靠前的通道通常更容易混进眼动和额肌噪声

所以当前 `ssvep_online.py` 默认用了：

```text
posterior4 = 5,6,7,8
```

## 为什么不建议直接从 `bci_ssvep_openvibe_ros` 开始

因为它对应的是另一种项目结构：

- OpenViBE 做采集、训练和在线分类
- ROS 做机器人控制
- 整个流程更重、更旧、依赖更多

但它依然很值得学习，因为里面保存了很多实验逻辑：

- 参数统一配置
- 训练采集顺序
- 在线阈值和投票逻辑
- confusion matrix / ITR 评估思路

也就是说：

- 它不适合直接当主入口
- 但很适合作为“旧系统逻辑参考库”

如果你准备和 GPT 深入讨论 SSVEP 细节，推荐顺手读这份文档：

- [bci_ssvep_openvibe_ros/LEARNING_AND_MIGRATION_GUIDE.md](/mnt/d/SSVEP/bci_ssvep_openvibe_ros/LEARNING_AND_MIGRATION_GUIDE.md:1)

## 现在最值得做什么

如果按优先级排，当前最值得做的是：

1. 把刺激和采集分别跑稳
2. 对不同后部通道组做在线 CCA 对比
3. 讨论并明确 SSVEP 识别的正式参数
4. 再决定下一步架构是：
   - 先补 `ssvep_record.py`
   - 还是先补 FlickerHub 联动
   - 还是先补离线评估与投票逻辑

## 一句话总结当前仓库

这个仓库现在已经具备：

- 一个可用的 SSVEP 刺激前端
- 一个可用的 BrainFlow EEG 采集与阻抗监看工具
- 一个最小在线 CCA 解码原型

但还没有真正完成：

- 正式实验流
- 正式在线闭环
- 正式评估体系

所以当前最合理的定位不是“完整产品”，而是：

**一个已经打通刺激、采集、初步在线解码的 SSVEP 研发工作区。**
