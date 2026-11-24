"""
examples/secure-config.py

租户配置安全加载器演练示例 (Python 3.10+)
演示：
- 严格租户 ID 格式白名单正则校验（防范路径遍历、斜杠、盘符与空字节）
- 路径越界二次校验 (is_relative_to)
- 真正不可变数据结构 (MappingProxyType 递归冻结)
- PEP 3134 异常因果链保留 (raise ... from err)
"""

from __future__ import annotations
import json
import logging
from pathlib import Path
import re
from types import MappingProxyType
from typing import Any, Mapping

logger = logging.getLogger(__name__)

# 严格租户 ID 白名单：仅允许 1~64 位大小写字母、数字、下划线、连字符
# 坚决拒绝 ..、/、\\、控制字符与空字节
VALID_TENANT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class ConfigurationError(Exception):
    def __init__(self, message: str, config_file: str):
        super().__init__(message)
        self.config_file = config_file


def _freeze_mapping(obj: Any) -> Any:
    """递归将嵌套字典转换为 MappingProxyType，将嵌套列表转换为 tuple，保证真正不可变"""
    if isinstance(obj, dict):
        return MappingProxyType({k: _freeze_mapping(v) for k, v in obj.items()})
    elif isinstance(obj, list):
        return tuple(_freeze_mapping(x) for x in obj)
    return obj


def load_tenant_config(config_dir: str | Path, tenant_id: str) -> Mapping[str, Any]:
    """
    安全加载租户配置文件并返回只读 Mapping。

    :param config_dir: 基础配置目录
    :param tenant_id: 租户唯一标识
    :return: 深度不可变的只读字典映射
    :raises ValueError: 当 tenant_id 格式不符合安全白名单时
    :raises ConfigurationError: 当配置文件不存在或格式损坏时
    """
    # 1. 严格白名单正则校验（防御路径遍历）
    if not isinstance(tenant_id, str) or not VALID_TENANT_ID_PATTERN.match(tenant_id):
        raise ValueError(
            f"Invalid tenant_id format: {tenant_id!r}. Must strictly match ^[a-zA-Z0-9_-]{{1,64}}$"
        )

    base_dir = Path(config_dir).resolve()
    target_file = (base_dir / f"{tenant_id}.json").resolve()

    # 2. 路径防越界二次防护断言
    if not target_file.is_relative_to(base_dir):
        raise ValueError(f"Path traversal detected: {target_file} is outside {base_dir}")

    # 3. 文件存在性卫语句 (W04)
    if not target_file.is_file():
        raise ConfigurationError(
            f"Tenant configuration file not found: {target_file}",
            config_file=str(target_file)
        )

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                raise TypeError(f"Config root must be a JSON object, got {type(data).__name__}")
            # 真正的不可变只读包装 (W02)
            return _freeze_mapping(data)
    except (json.JSONDecodeError, OSError, TypeError) as err:
        # W07: 使用 PEP 3134 完整保留底层异常作为 cause
        raise ConfigurationError(
            f"Failed to read or parse tenant config from {target_file}: {err}",
            config_file=str(target_file)
        ) from err
