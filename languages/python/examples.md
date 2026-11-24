# Python 白盒模式正反例

> 本文档提供 Python 3.10+ 环境下的白盒正反例对比，重点演示 PEP 3134 异常因果链、可变默认实参规避与边界单点日志。

---

## 示例 1：异常因果链保留 vs 暴力粗暴替换 (W01, W07)

### 业务场景
读取本地 JSON 配置文件并解析为强类型对象。若文件不存在或 JSON 格式非法，抛出业务配置加载异常。

### ❌ 反例 (黑盒：丢失原始 cause 堆栈)

```python
# ❌ 错误示范：catch 住底层异常后直接抛出新的，Traceback 链条被切断
import json

class ConfigLoadError(Exception):
    pass

def load_app_config(file_path: str) -> dict:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # 致命 W01/W07：原始的 FileNotFoundError 或 JSONDecodeError 详细行列号彻底丢失！
        raise ConfigLoadError(f"Failed to load configuration from {file_path}")
```

### ✅ 正例 (白盒：PEP 3134 异常链保留)

```python
# ✅ 正确示范：使用 raise ... from err 保留原始因果
import json
from pathlib import Path
from typing import Any

class ConfigLoadError(Exception):
    def __init__(self, message: str, file_path: str):
        super().__init__(message)
        self.file_path = file_path

def load_app_config(file_path: str) -> dict[str, Any]:
    path = Path(file_path)
    if not path.is_file():
        raise ConfigLoadError(f"Configuration file does not exist: {file_path}", file_path=file_path)

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                raise TypeError(f"Config root must be a JSON object, got {type(data).__name__}")
            return data
    except (json.JSONDecodeError, OSError, TypeError) as err:
        # 白盒标准：通过 from err 显式保留初始因果与堆栈细节
        raise ConfigLoadError(
            f"Failed to load or parse configuration from {file_path}: {err}",
            file_path=file_path
        ) from err
```

---

## 示例 2：可变入参防御性复制 (W02)

### 业务场景
计算每个员工的绩效评分，并追加年度全员通用奖项（如 "ANNUAL_PARTICIPATION"）。

### ❌ 反例 (黑盒：就地修改传入字典或列表)

```python
# ❌ 错误：函数直接修改了传入列表中的 dict 对象，外部调用方的原数据被篡改！
def apply_annual_bonus(employees: list[dict], bonus_name: str) -> list[dict]:
    for emp in employees:
        # 致命 W02：就地在原字典上追加属性！
        emp["awards"] = emp.get("awards", [])
        emp["awards"].append(bonus_name)
    return employees
```

### ✅ 正例 (白盒：不可变字典与浅拷贝)

```python
# ✅ 正确示范：返回全新对象列表，保持调用方传入的数据原貌
from typing import Mapping, Sequence

def apply_annual_bonus(
    employees: Sequence[Mapping[str, Any]],
    bonus_name: str
) -> list[dict[str, Any]]:
    if not bonus_name or not bonus_name.strip():
        raise ValueError("bonus_name must be a non-empty string")

    updated_employees: list[dict[str, Any]] = []
    for emp in employees:
        current_awards = list(emp.get("awards", []))
        current_awards.append(bonus_name)
        
        # 浅拷贝构造新字典，不修改原字典
        new_emp = dict(emp)
        new_emp["awards"] = current_awards
        updated_employees.append(new_emp)

    return updated_employees
```
