# 主审阅反馈：金额精度反例

本轮只修复一个已复现的根因问题，并清理一个与支持版本矛盾的分支。

## 已复现的账务错误

运行 `node -e "import('./examples/payment-checkout.ts').then(m=>{for(const v of [0.001,1.005,1.015]){const r=m.computeCheckoutTotal(v,'NORM_10','STANDARD');console.log(v,JSON.stringify(r),v===Number((r.discount+r.finalPay).toFixed(2)))}})"` 得到三个 `false`。当前函数只拒绝非有限值和非正值，却接受多于两位小数的“元”金额；随后用 `toFixed(2)` 将它们四舍五入，导致文档承诺的账务恒等式失效。输入精度约束缺失是根因。

请先写会失败的回归断言，再明确金额契约并修复：建议仅接受精确到“分”的输入（对超过两位小数的金额抛出 `RangeError`），在整数分上计算和约束最低实付，然后输出元值。若选择其他方案，必须对上述三个输入做明确处理，不能静默改变实际应付金额。同步更新 `examples/payment-checkout.ts`、`examples/integration-walkthrough.md`、对应测试，验证普通、全额抵扣、小额、非法精度输入。

## Python 版本分支

`examples/secure-config.py` 声明支持 Python 3.10+，`Path.is_relative_to` 在支持范围内可用；`except AttributeError` 的低版本回退用字符串 `startswith` 判路径前缀，反而是一个不安全的教学示范。请删除这条不可达且不安全的回退，保留 `is_relative_to` 检查和现有测试。

完成后报告所有实际验证命令与结果。不推送、不创建 PR。
